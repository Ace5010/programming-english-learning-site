"""Offline SenseVoice ONNX component screen. This is not pronunciation grading."""
import argparse
import hashlib
import importlib.util
import json
import re
import statistics
import sys
import time
import zipfile

import numpy as np
import onnxruntime as ort
import sentencepiece as spm
import yaml
from local_pronunciation import ROOT, RUNTIME, decode
from benchmark_replacement_pronunciation import block_network

OUT = ROOT/'artifacts/course-upgrade/pre-push/pronunciation'


def normalized(text):
    value = re.sub(r'[^a-z0-9 ]', '', text.lower()).strip()
    if value == '3':
        value = 'three'
    return ' '.join(value.split())


def load():
    folder = RUNTIME/'bench-models/SenseVoiceSmall-onnx'
    manifest = json.loads((folder/'download-manifest.json').read_text(encoding='utf-8'))
    for name, item in manifest['files'].items():
        with (folder/name).open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == item['sha256'], name
    # Only the publisher's unmodified fbank/LFR/CMVN frontend is needed here.
    # The exported graph and greedy CTC decoding match SenseVoiceSmall.__call__.
    wheel = RUNTIME/'wheels/funasr_onnx-0.4.1-py3-none-any.whl'
    wheel_sha = hashlib.sha256(wheel.read_bytes()).hexdigest()
    frontend_path = RUNTIME/'sensevoice-frontend-0.4.1.py'
    with zipfile.ZipFile(wheel) as archive:
        frontend_path.write_bytes(archive.read('funasr_onnx/utils/frontend.py'))
    spec = importlib.util.spec_from_file_location('sensevoice_official_frontend', frontend_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    config = yaml.safe_load((folder/'config.yaml').read_text(encoding='utf-8'))
    config['frontend_conf']['cmvn_file'] = str(folder/'am.mvn')
    frontend = module.WavFrontend(**config['frontend_conf'])
    # Serialized bytes avoid SentencePiece's Windows non-ASCII path handling.
    tokenizer = spm.SentencePieceProcessor(
        model_proto=(folder/'chn_jpn_yue_eng_ko_spectok.bpe.model').read_bytes())
    options = ort.SessionOptions()
    options.intra_op_num_threads = 6
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    session = ort.InferenceSession(str(folder/'model.onnx'), sess_options=options,
                                   providers=['CPUExecutionProvider'])
    inputs = [x.name for x in session.get_inputs()]
    assert len(inputs) == 4, inputs

    def run(audio):
        started = time.perf_counter()
        frames, _ = frontend.fbank(audio)
        features, length = frontend.lfr_cmvn(frames)
        # en=4; woitn=15. No target word, dictionary, or hotword is supplied.
        values = [features[None].astype(np.float32), np.array([length], dtype=np.int32),
                  np.array([4], dtype=np.int32), np.array([15], dtype=np.int32)]
        logits, lengths = session.run(None, dict(zip(inputs, values)))
        ids = logits[0, :int(lengths[0])].argmax(axis=-1)
        ids = ids[np.r_[True, ids[1:] != ids[:-1]]]
        raw = tokenizer.decode(ids[ids != 0].tolist())
        text = re.sub(r'<\|[^|]+\|>', '', raw).strip()
        return {'transcript': text, 'rawWithTags': raw, 'normalized': normalized(text),
                'modelMs': round((time.perf_counter()-started)*1000)}
    return run, manifest, wheel_sha


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--authorized-private', action='store_true')
    args = parser.parse_args()
    sys.addaudithook(block_network)
    started = time.perf_counter()
    run, manifest, wheel_sha = load()
    report = {'model': manifest['repo'], 'source': 'ModelScope community ONNX conversion',
              'files': manifest['files'], 'frontendWheelSha256': wheel_sha,
              'dtype': 'float32', 'language': 'English', 'referencePrompt': False,
              'networkDisabled': True, 'cloudCalls': 0, 'pronunciationAssessment': False,
              'loadMs': round((time.perf_counter()-started)*1000), 'cases': []}
    run(decode((ROOT/'public/audio/daily/aria/goodbye.mp3').read_bytes()))
    if args.authorized_private:
        private = {'model': report['model'], 'networkDisabled': True, 'cases': []}
        for word in ['goodbye', 'three']:
            audio = decode((RUNTIME/'private-diagnostic'/f'user-{word}.weba').read_bytes())
            results = [run(audio) for _ in range(3)]
            private['cases'].append({'reference': word, 'results': results})
            print('private', word, json.dumps(results, ensure_ascii=True), flush=True)
        (RUNTIME/'private-diagnostic/sensevoice-screening.json').write_text(
            json.dumps(private, ensure_ascii=False, indent=2), encoding='utf-8')
    plan = json.loads((OUT/'tencent-test-plan.json').read_text(encoding='utf-8'))['cases']
    plan += json.loads((OUT/'replacement-human-plan.json').read_text(encoding='utf-8'))['cases']
    cache = {}
    target = OUT/'sensevoice-screening.json'
    for case in plan:
        data = (ROOT/case['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == case['sha256']
        if case['file'] not in cache:
            cache[case['file']] = run(decode(data))
        result = dict(cache[case['file']])
        result['referenceTextMatch'] = result['normalized'] == normalized(case['reference'])
        if 'spokenFixture' in case:
            result['spokenWordMatch'] = result['normalized'] == normalized(case['spokenFixture'])
        report['cases'].append(dict(case, result=result))
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(case['id'], json.dumps(result, ensure_ascii=True), flush=True)
    report['controls'] = {name: run(wave) for name, wave in [
        ('silence', np.zeros(16000, dtype=np.float32)),
        ('noise', np.random.default_rng(42).normal(0, .01, 16000).astype(np.float32)),
        ('tone', (.1*np.sin(2*np.pi*440*np.arange(16000)/16000)).astype(np.float32))]}
    report['status'] = 'component-screen-complete-not-graded'
    report['medianModelMsUniqueInputs'] = statistics.median(x['modelMs'] for x in cache.values())
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(report['status'], report['medianModelMsUniqueInputs'], flush=True)


if __name__ == '__main__':
    main()
