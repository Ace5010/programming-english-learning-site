"""Check provenance/hashes, then fully decode each of the 88 local chart MP3s."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
from verify_daily_audio import audio_tools, inspect_audio
ROOT = Path(__file__).resolve().parent.parent
if __name__ == '__main__':
    subprocess.run(['node', 'scripts/verify-phonemic-assets.mjs'], cwd=ROOT, check=True)
    files = sorted((ROOT / 'public/audio/phonemes/uk').glob('*.mp3'))
    commands = audio_tools()
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda file: inspect_audio(file, commands), files))
    print(json.dumps({'decoded': len(results), 'bytes': sum(item['bytes'] for item in results), 'failures': 0}))
