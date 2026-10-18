"""Offline replacement screening; private recordings/results stay under .runtime.

This records perceived phones, not calibrated pronunciation grades. Download and
review pinned model bundles separately. No automatic model downloads or uploads.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                  WANDB_MODE='disabled', WANDB_DISABLED='true',
                  HF_HUB_DISABLE_TELEMETRY='1', TORCH_FORCE_WEIGHTS_ONLY_LOAD='1')

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime/pronunciation'
OUT = ROOT / 'artifacts/course-upgrade/pre-push/pronunciation'


def block_network(event, args):
    if event in {'socket.connect', 'socket.getaddrinfo', 'socket.sendto'}:
        raise RuntimeError('Network disabled during local recording evaluation')


def decode(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                             '-i', str(path), '-t', '30', '-f', 'f32le', '-ac', '1',
                             '-ar', '16000', 'pipe:1'], capture_output=True, check=True, timeout=12)
    return torch.from_numpy(np.frombuffer(result.stdout, dtype='<f4').copy())


def loader(kind):
    if kind == 'xeus':
        from transformers import AutoModel
        folder = RUNTIME / 'bench-models/PhoneticXeus'
        model, info = AutoModel.from_pretrained(str(folder), trust_remote_code=True,
                          local_files_only=True, output_loading_info=True)
        assert not info['missing_keys'] and not info['unexpected_keys'], info
        model.eval()

        def infer(audio):
            row = model.transcribe(audio, sampling_rate=16000)[0]
            return {'perceived': row['processed_transcript'],
                    'tokens': row['predicted_transcript']}
    else:
        folder = RUNTIME / 'bench-models/CROTTC-IF-l2-arctic'
        spec = importlib.util.spec_from_file_location('crottc_bundle', folder/'custom_interface.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.from_pretrained(folder, device='cpu', overrides=[
            'ctc_decode_weight=0.99',
            'output_folder=' + (RUNTIME/'replacement-work').as_posix()])

        def infer(audio):
            batch = module._AudioBatch(audio[None], torch.ones(1), ['local-sample'])
            result = model.brain.inference_batch(batch)
            ids = result['p_ctc_feat'].argmax(dim=-1)[0].unique_consecutive().tolist()
            ctc = model.label_encoder.decode_ndim([i for i in ids if i != model.brain.hparams.blank_index])
            seq = result['hyps'][0]
            if torch.is_tensor(seq):
                seq = seq.tolist()
            return {'perceived': ' '.join(model.label_encoder.decode_ndim(seq)),
                    'ctc': ctc}
    return infer, json.loads((folder/'download-manifest.json').read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True, choices=['xeus', 'crottc'])
    parser.add_argument('--private-sample', type=Path)
    parser.add_argument('--human-plan', type=Path)
    args = parser.parse_args()
    if args.private_sample:
        args.private_sample = args.private_sample.resolve()
        args.private_sample.relative_to((RUNTIME/'private-diagnostic').resolve())
    torch.set_num_threads(6)
    torch.set_num_interop_threads(1)
    sys.addaudithook(block_network)
    start = time.perf_counter()
    infer, manifest = loader(args.model)
    load_ms = round((time.perf_counter()-start)*1000)
    with torch.inference_mode():
        infer(decode(ROOT/'public/audio/daily/aria/goodbye.mp3'))
        report = {'model': args.model, 'revision': manifest['revision'], 'loadMs': load_ms,
                  'networkDisabled': True, 'calibratedAssessment': False, 'cases': []}
        if args.private_sample:
            audio = decode(args.private_sample)
            start = time.perf_counter()
            private = infer(audio)
            private.update(elapsedMs=round((time.perf_counter()-start)*1000),
                           model=args.model, revision=manifest['revision'],
                           audioSha256=hashlib.file_digest(args.private_sample.open('rb'), 'sha256').hexdigest(),
                           notHumanPhoneticAnnotation=True)
            (RUNTIME/f'private-diagnostic/{args.model}-replacement.json').write_text(
                json.dumps(private, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'privateResult': private}, ensure_ascii=True), flush=True)
        plan = json.loads((OUT/'tencent-test-plan.json').read_text(encoding='utf-8'))['cases']
        if args.human_plan:
            plan += json.loads(args.human_plan.read_text(encoding='utf-8'))['cases']
        cache = {}
        for case in plan:
            path = ROOT/case['file']
            assert hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() == case['sha256']
            if case['file'] not in cache:
                start = time.perf_counter()
                value = infer(decode(path))
                value['elapsedMs'] = round((time.perf_counter()-start)*1000)
                cache[case['file']] = value
            report['cases'].append(dict(case, result=cache[case['file']]))
            print(case['id'], json.dumps(cache[case['file']], ensure_ascii=True), flush=True)
            (OUT/f'{args.model}-replacement-results.json').write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        report['medianMsUniqueInputs'] = statistics.median(r['elapsedMs'] for r in cache.values())
        report['controls'] = {}
        for name, audio in [('silence', torch.zeros(16000)),
                            ('noise', torch.from_numpy(np.random.default_rng(42).normal(0,.01,16000).astype('float32')))]:
            report['controls'][name] = infer(audio)
        report['status'] = 'screening-complete-not-production'
        (OUT/f'{args.model}-replacement-results.json').write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
