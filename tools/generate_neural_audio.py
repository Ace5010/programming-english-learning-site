"""Generate resumable Aria/Guy word and example MP3s (pip install edge-tts==7.2.8)."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
VOICES = {'aria': 'en-US-AriaNeural', 'guy': 'en-US-GuyNeural'}

def read_vocabulary(path):
    source = path.read_text(encoding='utf-8')
    return json.loads(source.split('export const vocabulary: VocabularyItem[] = ', 1)[1].strip().removesuffix(';'))

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=8)
    parser.add_argument('--source', type=Path, default=ROOT / 'src/vocabulary.ts')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/audio')
    parser.add_argument('--changed-from', type=Path, help='Only generate words/examples whose text differs from this vocabulary snapshot')
    parser.add_argument('--only-ids', type=int, nargs='+', help='Optionally restrict generation to these word IDs')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.workers < 1:
        parser.error('--workers must be positive')
    vocabulary = read_vocabulary(args.source)
    previous = {item['id']: item for item in read_vocabulary(args.changed_from)} if args.changed_from else {}
    if args.only_ids:
        missing = set(args.only_ids) - {item['id'] for item in vocabulary}
        if missing:
            parser.error(f'Unknown IDs: {sorted(missing)}')
        vocabulary = [item for item in vocabulary if item['id'] in args.only_ids]
    manifest_path = args.output_dir / 'neural-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    jobs = []
    for folder, voice in VOICES.items():
        target = args.output_dir / folder
        for item in vocabulary:
            for kind, text in [('word', item['word']), ('example', item['example'])]:
                if args.changed_from and previous.get(item['id'], {}).get(kind) == text:
                    continue
                jobs.append((target / f'{kind}-{item["id"]}.mp3', voice, text))
        if not args.changed_from and not args.only_ids:
            jobs.append((target / 'voice-test.mp3', voice, 'Repository. Function. Variable. Commit.'))

    def fingerprint(voice, text):
        return hashlib.sha256(f'{voice}\n+0%\n{text}'.encode('utf-8')).hexdigest()

    def needs_update(job):
        path, voice, text = job
        if not path.exists() or path.stat().st_size < 100:
            return True
        recorded = manifest.get(path.relative_to(args.output_dir).as_posix())
        if recorded is not None:
            return recorded['sha256'] != fingerprint(voice, text)
        # Legacy files have no text manifest. A text diff explicitly invalidates
        # those files; otherwise preserve existing, potentially costly audio.
        return bool(args.changed_from)

    pending = [job for job in jobs if needs_update(job)]
    print(f'Total {len(jobs)}, pending {len(pending)}', flush=True)
    if args.dry_run:
        return
    for folder in VOICES:
        (args.output_dir / folder).mkdir(parents=True, exist_ok=True)

    def save_manifest():
        temporary = manifest_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(manifest_path)

    queue = asyncio.Queue()
    for job in pending:
        queue.put_nowait(job)
    completed = 0
    errors = []
    async def worker():
        nonlocal completed
        while not queue.empty():
            path, voice, text = queue.get_nowait()
            temporary = path.with_suffix('.part')
            for attempt in range(5):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(text, voice, rate='+0%').save(str(temporary)), 60)
                    if temporary.stat().st_size < 100:
                        raise ValueError('Empty audio')
                    temporary.replace(path)
                    manifest[path.relative_to(args.output_dir).as_posix()] = {
                        'voice': voice, 'text': text, 'sha256': fingerprint(voice, text),
                    }
                    break
                except Exception as exc:
                    if attempt == 4:
                        errors.append((str(path), str(exc)))
                    else:
                        await asyncio.sleep(2 ** attempt)
            completed += 1
            if completed % 25 == 0:
                save_manifest()
            if completed % 100 == 0 or completed == len(pending):
                print(f'Completed {completed}/{len(pending)}, failed {len(errors)}', flush=True)
            queue.task_done()
    try:
        await asyncio.gather(*(worker() for _ in range(args.workers)))
    finally:
        save_manifest()
    if errors:
        print(json.dumps(errors, ensure_ascii=False), flush=True)
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
