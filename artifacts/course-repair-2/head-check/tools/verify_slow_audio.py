"""Validate every referenced file, fully decode it, and check each packed boundary."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
from verify_daily_audio import audio_tools, inspect_audio

ROOT = Path(__file__).resolve().parent.parent
if __name__ == '__main__':
    subprocess.run(['node', str(ROOT / 'scripts/verify-slow-assets.mjs')], cwd=ROOT, check=True)
    manifest = json.loads((ROOT / 'public/audio/slow/manifest.json').read_text(encoding='utf8'))
    paths = list(manifest['files'])
    tools = audio_tools()
    with ThreadPoolExecutor(max_workers=6) as pool:
        records = dict(zip(paths, pool.map(lambda p: inspect_audio(ROOT / 'public/audio' / p, tools), paths)))
    for key, clip in manifest['clips'].items():
        if clip['endMs'] > records[clip['path']]['durationSeconds'] * 1000 + 25:
            raise ValueError(f'Segment outside file: {key}')
    print(f'Decoded {len(records)} reused/packed files; checked {len(manifest["clips"])} word boundaries.')
