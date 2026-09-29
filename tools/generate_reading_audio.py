"""Generate missing course word/option recordings in both existing voices, resumably."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from generate_daily_audio import atomic_json, temporary_mp3
from verify_daily_audio import VOICES, RATE, audio_tools, inspect_audio, synthesis_hash, entry_matches

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'public/audio/reading'


async def generate(args):
    import edge_tts
    entries = json.loads((ROOT / 'src/readingAudio.json').read_text(encoding='utf-8'))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / 'neural-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'version': 1, 'entries': {}}
    queue = asyncio.Queue()
    for folder, voice in VOICES.items():
        (OUTPUT / folder).mkdir(exist_ok=True)
        for entry in entries:
            relative = f'{folder}/{entry["id"]}.mp3'
            phrase = {'id': entry['id'], 'en': entry['text']}
            if not entry_matches(manifest['entries'].get(relative), OUTPUT / relative, phrase, voice):
                queue.put_nowait((relative, voice, entry))
    total = queue.qsize()
    print(f'Additional course recordings: {total} pending.', flush=True)
    tools = audio_tools()
    completed = 0
    failures = []

    async def worker():
        nonlocal completed
        while not queue.empty():
            relative, voice, entry = queue.get_nowait()
            target = OUTPUT / relative
            for attempt in range(3):
                temporary = temporary_mp3(target.parent, target.stem)
                try:
                    await asyncio.wait_for(edge_tts.Communicate(entry['text'], voice, rate=RATE).save(str(temporary)), timeout=45)
                    metadata = await asyncio.to_thread(inspect_audio, temporary, tools)
                    metadata.update(id=entry['id'], text=entry['text'], voice=voice, rate=RATE,
                                    synthesisSha256=synthesis_hash(voice, entry['text']),
                                    generatedAt=datetime.now(timezone.utc).isoformat(timespec='seconds'))
                    temporary.replace(target)
                    manifest['entries'][relative] = metadata
                    atomic_json(manifest_path, manifest)
                    completed += 1
                    if completed % 20 == 0 or completed == total:
                        print(f'Completed {completed}/{total}; failures {len(failures)}.', flush=True)
                    break
                except Exception as error:
                    temporary.unlink(missing_ok=True)
                    if attempt == 2:
                        failures.append(relative)
                        print(f'FAILED {relative}: {type(error).__name__}: {error}', flush=True)
                    else:
                        await asyncio.sleep(2 ** attempt)
            queue.task_done()
    await asyncio.gather(*(worker() for _ in range(args.workers)))
    if failures:
        raise RuntimeError(f'{len(failures)} recordings failed; rerun to resume.')
    print(f'Complete: {len(entries)} texts, two voices.', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.workers <= 12:
        parser.error('--workers must be between 1 and 12')
    asyncio.run(generate(args))
