"""Generate only public/audio/daily Aria/Guy MP3s, with text-aware atomic resume.

Use the existing neural environment: .venv/Scripts/python.exe tools/generate_daily_audio.py
Validate independently afterward: python tools/verify_daily_audio.py
"""
import argparse
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

from verify_daily_audio import (
    AUDIO_DIR, MANIFEST_NAME, RATE, SOURCE, VOICES,
    audio_tools, course_revision, entry_matches, inspect_audio, load_manifest,
    load_phrases, synthesis_hash,
)


def atomic_json(path, value):
    descriptor, name = tempfile.mkstemp(prefix='.daily-manifest-', suffix='.tmp', dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def temporary_mp3(folder, phrase_id):
    descriptor, name = tempfile.mkstemp(prefix=f'.{phrase_id}-', suffix='.part', dir=folder)
    os.close(descriptor)
    return Path(name)


def atomic_copy(source, destination):
    temporary = temporary_mp3(destination.parent, destination.stem)
    try:
        shutil.copyfile(source, temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


async def generate(args):
    phrases = load_phrases(args.source)
    selected = phrases
    if args.only_ids:
        missing = set(args.only_ids) - {phrase['id'] for phrase in phrases}
        if missing:
            raise ValueError(f'Unknown phrase IDs: {sorted(missing)}')
        selected = [phrase for phrase in phrases if phrase['id'] in args.only_ids]
    manifest = load_manifest(AUDIO_DIR) or {'version': 1, 'entries': {}}
    manifest.update({
        'revision': course_revision(phrases), 'phraseCount': len(phrases),
        'voices': VOICES, 'rate': RATE,
    })
    groups = defaultdict(list)
    for folder in args.voices:
        for phrase in selected:
            groups[(folder, phrase['en'])].append(phrase)
    pending = []
    reusable = {}
    skipped = 0
    for (folder, text), group in groups.items():
        targets = []
        for phrase in group:
            relative = f'{folder}/{phrase["id"]}.mp3'
            if entry_matches(manifest['entries'].get(relative), AUDIO_DIR / relative, phrase, VOICES[folder]):
                reusable[(folder, text)] = (AUDIO_DIR / relative, manifest['entries'][relative])
                skipped += 1
            else:
                targets.append(phrase)
        if targets:
            pending.append((folder, text, targets))
    pending_files = sum(len(group) for _, _, group in pending)
    print(json.dumps({
        'phrases': len(phrases), 'selectedFiles': len(selected) * len(args.voices),
        'validSkipped': skipped, 'pendingFiles': pending_files,
        'pendingTextGroups': len(pending), 'revision': manifest['revision'],
    }, ensure_ascii=False), flush=True)
    if args.dry_run:
        return
    tools = audio_tools()
    try:
        import edge_tts
    except ImportError as exc:
        raise ValueError('edge-tts is missing. Run with .venv/Scripts/python.exe or install tools/requirements-neural.txt.') from exc
    for folder in args.voices:
        (AUDIO_DIR / folder).mkdir(parents=True, exist_ok=True)
    manifest_path = AUDIO_DIR / MANIFEST_NAME
    queue = asyncio.Queue()
    for job in pending:
        queue.put_nowait(job)
    failures = []
    completed_files = 0
    synthesized_groups = 0
    copied_files = 0

    async def worker():
        nonlocal completed_files, synthesized_groups, copied_files
        while True:
            try:
                folder, text, targets = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            voice = VOICES[folder]
            first_path = AUDIO_DIR / folder / f'{targets[0]["id"]}.mp3'
            temporary = None
            try:
                source, metadata = reusable.get((folder, text), (None, None))
                if source is None:
                    for attempt in range(args.attempts):
                        temporary = temporary_mp3(first_path.parent, first_path.stem)
                        try:
                            await asyncio.wait_for(
                                edge_tts.Communicate(text, voice, rate=RATE).save(str(temporary)),
                                timeout=args.timeout,
                            )
                            metadata = await asyncio.to_thread(inspect_audio, temporary, tools)
                            metadata.update({
                                'voice': voice, 'rate': RATE, 'text': text,
                                'synthesisSha256': synthesis_hash(voice, text),
                                'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                            })
                            temporary.replace(first_path)
                            temporary = None
                            source = first_path
                            synthesized_groups += 1
                            break
                        except Exception as exc:
                            temporary.unlink(missing_ok=True)
                            temporary = None
                            print(f'Retry {attempt + 1}/{args.attempts} {folder}/{targets[0]["id"]}: {type(exc).__name__}: {exc}', flush=True)
                            if attempt + 1 == args.attempts:
                                raise
                            await asyncio.sleep(min(2 ** attempt, 8))
                for phrase in targets:
                    path = AUDIO_DIR / folder / f'{phrase["id"]}.mp3'
                    if path != source:
                        await asyncio.to_thread(atomic_copy, source, path)
                        copied_files += 1
                    entry = {key: value for key, value in metadata.items() if key not in ('id', 'copiedFrom')}
                    entry['id'] = phrase['id']
                    if path != source:
                        entry['copiedFrom'] = source.relative_to(AUDIO_DIR).as_posix()
                    manifest['entries'][path.relative_to(AUDIO_DIR).as_posix()] = entry
                    completed_files += 1
                atomic_json(manifest_path, manifest)
                if completed_files % 20 == 0 or completed_files == pending_files:
                    print(f'Completed {completed_files}/{pending_files} daily files; synthesized {synthesized_groups}, copied {copied_files}, failed groups {len(failures)}', flush=True)
            except Exception as exc:
                failures.append({'voice': folder, 'ids': [phrase['id'] for phrase in targets], 'error': f'{type(exc).__name__}: {exc}'})
                print(f'FAILED {folder}/{targets[0]["id"]}: {type(exc).__name__}: {exc}', flush=True)
            finally:
                if temporary:
                    temporary.unlink(missing_ok=True)
                queue.task_done()
    try:
        await asyncio.gather(*(worker() for _ in range(args.workers)))
    finally:
        atomic_json(manifest_path, manifest)
    if failures:
        print(json.dumps({'failures': failures}, ensure_ascii=False, indent=2), flush=True)
        raise ValueError(f'{len(failures)} text groups failed; rerun the same command to resume.')
    print(json.dumps({
        'complete': True, 'generatedFiles': completed_files, 'synthesizedVoiceTexts': synthesized_groups,
        'deduplicatedCopies': copied_files, 'validSkipped': skipped,
        'revision': manifest['revision'], 'output': str(AUDIO_DIR),
    }, ensure_ascii=False), flush=True)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--voices', nargs='+', choices=VOICES, default=list(VOICES))
    parser.add_argument('--only-ids', nargs='+')
    parser.add_argument('--workers', type=int, default=6)
    parser.add_argument('--attempts', type=int, default=4)
    parser.add_argument('--timeout', type=float, default=60)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.workers < 1 or args.attempts < 1 or args.timeout <= 0:
        parser.error('--workers, --attempts, and --timeout must be positive')
    args.voices = list(dict.fromkeys(args.voices))
    try:
        asyncio.run(generate(args))
    except KeyboardInterrupt:
        print('Daily audio generation interrupted; completed files can be resumed.', file=sys.stderr)
        return 130
    except (OSError, ValueError) as exc:
        print(f'Daily audio generation failed: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
