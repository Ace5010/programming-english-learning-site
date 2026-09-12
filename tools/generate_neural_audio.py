"""Generate resumable Aria/Guy word and example MP3s (pip install edge-tts==7.2.8)."""
import argparse
import asyncio
import json
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
VOICES = {'aria': 'en-US-AriaNeural', 'guy': 'en-US-GuyNeural'}

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    source = (ROOT / 'src/vocabulary.ts').read_text(encoding='utf-8')
    vocabulary = json.loads(source.split('export const vocabulary: VocabularyItem[] = ', 1)[1].strip().removesuffix(';'))
    jobs = []
    for folder, voice in VOICES.items():
        target = ROOT / 'public/audio' / folder
        target.mkdir(parents=True, exist_ok=True)
        for item in vocabulary:
            for kind, text in [('word', item['word']), ('example', item['example'])]:
                jobs.append((target / f'{kind}-{item["id"]}.mp3', voice, text))
        jobs.append((target / 'voice-test.mp3', voice, 'Repository. Function. Variable. Commit.'))
    pending = [job for job in jobs if not job[0].exists() or job[0].stat().st_size == 0]
    print(f'Total {len(jobs)}, pending {len(pending)}', flush=True)
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
                    break
                except Exception as exc:
                    if attempt == 4:
                        errors.append((str(path), str(exc)))
                    else:
                        await asyncio.sleep(2 ** attempt)
            completed += 1
            if completed % 100 == 0 or completed == len(pending):
                print(f'Completed {completed}/{len(pending)}, failed {len(errors)}', flush=True)
            queue.task_done()
    await asyncio.gather(*(worker() for _ in range(args.workers)))
    if errors:
        print(json.dumps(errors, ensure_ascii=False), flush=True)
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
