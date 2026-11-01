"""Compare the same frozen public English fixtures; never sends reference hints."""
import argparse
import array
import hashlib
import json
import os
from pathlib import Path
import statistics
import sys
import time

from local_pronunciation import ROOT, decode
from benchmark_qwen_asr import normalized


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['original', 'q8', 'q8-ai'])
    args = parser.parse_args()
    target = ROOT / 'artifacts/shared-q8-20261027'
    target.mkdir(parents=True, exist_ok=True)
    cases = json.loads((ROOT / 'artifacts/asr-replacement-20261004/plan.json').read_text(encoding='utf-8'))['cases']
    start = time.perf_counter()
    model = session = None
    if args.mode == 'original':
        import torch
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        from benchmark_qwen_asr import load
        run, _, _ = load()
    else:
        shared = Path('D:/AI/Qwen3-ASR-1.7B')
        library = shared / 'runtime/transcribe-native-windows-x86_64-cpu-vulkan/transcribe.dll'
        os.environ['TRANSCRIBE_LIBRARY'] = str(library)
        dll_handle = os.add_dll_directory(str(library.parent))
        sys.path.insert(0, str(shared / 'runtime/python'))
        import transcribe_cpp as tc
        device = next(d for d in tc.backends() if d.kind == 'vulkan')
        model = tc.Model(shared / 'models/Qwen3-ASR-1.7B-Q8_0.gguf', device=device)
        session = model.session(n_threads=6)
        vocabulary = prompt = None
        if args.mode == 'q8-ai':
            sys.path.insert(0, str(shared))
            from domain import prepare_hints
            vocabulary, prompt = prepare_hints(json.loads((shared / 'hotwords.json').read_text(encoding='utf-8-sig')))
        def run(audio):
            begun = time.perf_counter()
            result = session.run(array.array('f', audio), language='en', timestamps='none', vocabulary=vocabulary, prompt=prompt)
            return {'transcript': result.text, 'normalized': normalized(result.text), 'modelMs': round((time.perf_counter()-begun)*1000)}
    report = {'mode': args.mode, 'language': 'en', 'referencePrompt': False, 'containsUserRecording': False,
              'loadMs': round((time.perf_counter()-start)*1000), 'cases': [], 'status': 'running'}
    output = target / f'{args.mode}.json'
    run(decode((ROOT / 'public/audio/daily/aria/goodbye.mp3').read_bytes()))
    for case in cases:
        data = (ROOT / case['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == case['sha256'], case['id']
        try:
            result = run(decode(data))
            result['match'] = result['normalized'] == normalized(case['reference'])
        except Exception as error:
            result = {'error': type(error).__name__ + ': ' + str(error)[:300], 'match': False}
        report['cases'].append(dict(case, result=result))
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(args.mode, case['id'], json.dumps(result, ensure_ascii=True), flush=True)
    report['status'] = 'complete'
    report['medianMs'] = statistics.median(c['result']['modelMs'] for c in report['cases'] if 'modelMs' in c['result'])
    report['matches'] = sum(c['result']['match'] for c in report['cases'])
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('COMPLETE', args.mode, report['matches'], len(cases), report['medianMs'], flush=True)
    if session: session.close()
    if model: model.close()


if __name__ == '__main__':
    main()
