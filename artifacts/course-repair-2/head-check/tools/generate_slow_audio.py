"""Build missing word recordings and packed audio, measuring reusable clip silence.

Raw synthesis stays in .runtime; only small packs and audited bounds enter public/.
No existing voice recording is rewritten. Resume by synthesis and file hashes.
"""
import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from generate_daily_audio import atomic_json, temporary_mp3
from verify_daily_audio import VOICES, RATE, audio_tools, inspect_audio, synthesis_hash, entry_matches

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / '.runtime/slow-audio'
OUT = ROOT / 'public/audio/slow'
SAMPLE_RATE = 24000

def decode(path):
    result = subprocess.run([audio_tools()[0], '-v', 'error', '-xerror', '-nostdin', '-threads', '1', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', str(SAMPLE_RATE), '-'], capture_output=True, check=True, timeout=30)
    pcm = np.frombuffer(result.stdout, dtype='<i2')
    # 10 ms RMS frames, -48 dB gate and generous 40/60 ms edge protection.
    n = len(pcm) // 240
    rms = np.sqrt(np.mean(pcm[:n * 240].astype(np.float64).reshape(n, 240) ** 2, axis=1))
    active = np.flatnonzero(rms > 130)
    if not len(active):
        raise ValueError(f'No speech energy: {path.name}')
    onset, offset = int(active[0]) * .01, (int(active[-1]) + 1) * .01
    start, end = max(0, onset - .04), min(len(pcm) / SAMPLE_RATE, offset + .06)
    return pcm, dict(startMs=round(start * 1000), endMs=round(end * 1000), leadingMs=round((onset-start)*1000), trailingMs=round((end-offset)*1000))

async def generate(workers):
    import edge_tts
    inventory_bytes = (ROOT / 'src/slowReadingInventory.json').read_bytes()
    inventory = json.loads(inventory_bytes)
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    raw_manifest_path = RAW / 'manifest.json'
    manifest = json.loads(raw_manifest_path.read_text(encoding='utf8')) if raw_manifest_path.exists() else {'version': 1, 'entries': {}}
    missing = [e for e in inventory['entries'] if e['generated']]
    queue = asyncio.Queue()
    for folder, voice in VOICES.items():
        (RAW / folder).mkdir(exist_ok=True)
        for e in missing:
            relative = f'{folder}/{Path(e["path"]).name}'
            phrase = {'id': Path(e['path']).stem, 'en': e['spoken']}
            if not entry_matches(manifest['entries'].get(relative), RAW / relative, phrase, voice):
                queue.put_nowait((relative, voice, e, phrase))
    total, completed, failures = queue.qsize(), 0, []
    print(f'Missing synthesis: {total}; {len(missing)} distinct units.', flush=True)
    async def worker():
        nonlocal completed
        while not queue.empty():
            relative, voice, e, phrase = queue.get_nowait()
            target = RAW / relative
            for attempt in range(3):
                tmp = temporary_mp3(target.parent, target.stem)
                try:
                    if 'targetIndex' in e:
                        boundaries = []
                        async def contextual():
                            with tmp.open('wb') as output:
                                async for chunk in edge_tts.Communicate(e['spoken'], voice, rate=RATE, boundary='WordBoundary').stream():
                                    if chunk['type'] == 'audio': output.write(chunk['data'])
                                    elif chunk['type'] == 'WordBoundary': boundaries.append(chunk)
                        await asyncio.wait_for(contextual(), 45)
                        boundary = boundaries[e['targetIndex']]
                        expected = e['text'].split('@')[0]
                        if boundary['text'].lower().strip('.,!?') != expected: raise ValueError(f'Unexpected contextual boundary: expected {expected}, received {boundary["text"]}, boundaries={[b["text"] for b in boundaries]}')
                        cropped = temporary_mp3(target.parent, 'context')
                        try:
                            subprocess.run([audio_tools()[0], '-v', 'error', '-y', '-i', str(tmp), '-ss', str(max(0,boundary['offset']/1e7-.015)), '-t', str(boundary['duration']/1e7+.03), '-codec:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', str(cropped)], check=True)
                            cropped.replace(tmp)
                        finally: cropped.unlink(missing_ok=True)
                    else:
                        await asyncio.wait_for(edge_tts.Communicate(e['spoken'], voice, rate=RATE).save(str(tmp)), 45)
                    metadata = await asyncio.to_thread(inspect_audio, tmp)
                    metadata.update(id=phrase['id'], text=e['spoken'], voice=voice, rate=RATE, synthesisSha256=synthesis_hash(voice, e['spoken']))
                    tmp.replace(target)
                    manifest['entries'][relative] = metadata
                    atomic_json(raw_manifest_path, manifest)
                    completed += 1
                    if completed % 100 == 0 or completed == total: print(f'Synthesized {completed}/{total}', flush=True)
                    break
                except Exception as error:
                    tmp.unlink(missing_ok=True)
                    if attempt == 2:
                        failures.append(relative)
                        print(f'FAILED {relative}: {type(error).__name__}: {error}', flush=True)
                    else: await asyncio.sleep(2 ** attempt)
            queue.task_done()
    await asyncio.gather(*(worker() for _ in range(workers)))
    if failures: raise RuntimeError(f'{len(failures)} synthesis failures; rerun to resume')
    clips, files = {}, {}
    old_path = OUT / 'manifest.json'
    old = json.loads(old_path.read_text(encoding='utf8')) if old_path.exists() else {'clips': {}, 'files': {}}
    reused = [(folder, e) for folder in VOICES for e in inventory['entries'] if not e['generated']]
    def measure(pair):
        folder, e = pair
        path = e['path'].replace('{voice}', folder)
        target = ROOT / 'public/audio' / path
        fingerprint = sha256(target.read_bytes()).hexdigest()
        key = folder + ':' + e['text']
        previous = old['clips'].get(key)
        if previous and old['files'].get(path, {}).get('sha256') == fingerprint:
            bounds = {k: previous[k] for k in ['startMs','endMs','leadingMs','trailingMs']}
        else: _, bounds = decode(target)
        return key, dict(path=path, text=e['text'], spoken=e['spoken'], voice=VOICES[folder], **bounds), path, dict(sha256=fingerprint, bytes=target.stat().st_size)
    with ThreadPoolExecutor(max_workers=6) as pool:
        for key, record, path, meta in pool.map(measure, reused):
            clips[key], files[path] = record, meta
    print(f'Measured {len(reused)} reused clips.', flush=True)
    for folder, voice in VOICES.items():
        (OUT / folder).mkdir(exist_ok=True)
        for batch in range(0, len(missing), 100):
            chunks, offsets, length = [], [], 0
            entries = missing[batch:batch+100]
            with ThreadPoolExecutor(max_workers=6) as pool:
                decoded = list(pool.map(lambda e: decode(RAW / folder / Path(e['path']).name), entries))
            for e, (pcm, bounds) in zip(entries, decoded):
                segment = pcm[round(bounds['startMs'] * 24):round(bounds['endMs'] * 24)]
                offsets.append((e, dict(bounds, startMs=round(length/24), endMs=round((length+len(segment))/24))))
                chunks.extend([segment.tobytes(), bytes(4800)])
                length += len(segment) + 2400
            target = OUT / folder / f'pack-{batch//100}.mp3'
            tmp = temporary_mp3(RAW, target.stem)
            try:
                subprocess.run([audio_tools()[0], '-v', 'error', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', str(tmp)], input=b''.join(chunks), check=True)
                meta = inspect_audio(tmp)
                tmp.replace(target)
            finally: tmp.unlink(missing_ok=True)
            path = f'slow/{folder}/{target.name}'
            files[path] = dict(sha256=meta['fileSha256'], bytes=meta['bytes'])
            for e, bounds in offsets:
                clips[folder + ':' + e['text']] = dict(path=path, text=e['text'], spoken=e['spoken'], voice=voice, **bounds)
    result = dict(version=1, inventorySha256=sha256(inventory_bytes).hexdigest(), clips=clips, files=files)
    atomic_json(OUT / 'manifest.json', result)
    # Runtime only needs bounds, paths, and token keys; provenance remains in public manifest.
    subprocess.run(['node', str(ROOT / 'scripts/build-slow-index.mjs')], check=True)
    print(json.dumps(dict(texts=len(inventory['texts']), units=len(inventory['entries']), generatedRecordings=len(missing)*2, packedFiles=len(list(OUT.glob('*/*.mp3'))), addedBytes=sum(x.stat().st_size for x in OUT.rglob('*') if x.is_file()))), flush=True)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=8, choices=range(1,13))
    asyncio.run(generate(parser.parse_args().workers))
