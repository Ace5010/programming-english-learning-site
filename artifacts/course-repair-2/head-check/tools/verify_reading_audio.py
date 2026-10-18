"""Check the reading inventory and fully decode every additional voice/feedback clip."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
from verify_daily_audio import audio_tools, inspect_audio

ROOT = Path(__file__).resolve().parent.parent
if __name__ == '__main__':
    subprocess.run(['node', str(ROOT / 'scripts/verify-reading-assets.mjs')], cwd=ROOT, check=True)
    files = list((ROOT / 'public/audio/reading').glob('*/*.mp3')) + list((ROOT / 'public/audio/feedback').glob('*.mp3'))
    tools = audio_tools()
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda path: inspect_audio(path, tools), files))
    print(f'Decoded {len(results)} additional recordings and feedback sounds without errors.')
