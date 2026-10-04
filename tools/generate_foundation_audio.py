"""Build the foundation course's separate two-voice recordings with atomic resume."""
import argparse
import asyncio
import json
from pathlib import Path
import shutil
from datetime import datetime, timezone
from generate_daily_audio import atomic_json, temporary_mp3
from verify_daily_audio import VOICES, RATE, audio_tools, inspect_audio, synthesis_hash, entry_matches

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'public/audio/foundation'

async def generate(workers):
    import edge_tts
    entries = json.loads((ROOT / 'src/foundationAudio.json').read_text(encoding='utf-8'))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / 'neural-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'version': 1, 'entries': {}}
    reusable = {}
    for relative in ['neural-manifest.json', 'daily/neural-manifest.json', 'reading/neural-manifest.json']:
        path = ROOT / 'public/audio' / relative
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding='utf-8'))
        for name, record in data.get('entries', data).items():
            if not isinstance(record, dict) or not record.get('text'):
                continue
            file = path.parent / name
            if file.exists():
                reusable[(record.get('voice'), record['text'])] = file
    queue = asyncio.Queue()
    for folder, voice in VOICES.items():
        (OUTPUT / folder).mkdir(exist_ok=True)
        for entry in entries:
            relative = f'{folder}/{entry["id"]}.mp3'
            record = manifest['entries'].get(relative)
            spoken = entry.get('ttsText', entry['text'])
            comparable = dict(record, text=record.get('spoken', record['text'])) if record else None
            if not entry_matches(comparable, OUTPUT / relative, {'id': entry['id'], 'en': spoken}, voice):
                queue.put_nowait((relative, voice, entry))
    total, completed, reused = queue.qsize(), 0, 0
    print(f'Foundation: {len(entries)} texts; {total} pending recordings.', flush=True)
    commands, failures = audio_tools(), []
    async def worker():
        nonlocal completed, reused
        while not queue.empty():
            relative, voice, entry = queue.get_nowait()
            target = OUTPUT / relative
            for attempt in range(3):
                temporary = temporary_mp3(target.parent, target.stem)
                try:
                    spoken = entry.get('ttsText', entry['text'])
                    source = reusable.get((voice, spoken))
                    if source:
                        shutil.copyfile(source, temporary)
                    else:
                        await asyncio.wait_for(edge_tts.Communicate(spoken, voice, rate=RATE).save(str(temporary)), timeout=45)
                    metadata = await asyncio.to_thread(inspect_audio, temporary, commands)
                    metadata.update(id=entry['id'], text=entry['text'], voice=voice, rate=RATE,
                        synthesisSha256=synthesis_hash(voice, spoken), generatedAt=datetime.now(timezone.utc).isoformat(timespec='seconds'))
                    if 'ttsText' in entry:
                        metadata['spoken'] = spoken
                    temporary.replace(target)
                    manifest['entries'][relative] = metadata
                    atomic_json(manifest_path, manifest)
                    completed += 1
                    reused += bool(source)
                    if completed % 30 == 0 or completed == total:
                        print(f'Completed {completed}/{total}; reused {reused}; failures {len(failures)}.', flush=True)
                    break
                except Exception as error:
                    temporary.unlink(missing_ok=True)
                    if attempt == 2:
                        failures.append(relative)
                        print(f'FAILED {relative}: {type(error).__name__}', flush=True)
                    else:
                        await asyncio.sleep(2 ** attempt)
            queue.task_done()
    await asyncio.gather(*(worker() for _ in range(workers)))
    if failures:
        raise RuntimeError(f'{len(failures)} recordings failed; rerun to resume.')
    print('Foundation recordings complete.', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, choices=range(1, 13), default=6)
    asyncio.run(generate(parser.parse_args().workers))
