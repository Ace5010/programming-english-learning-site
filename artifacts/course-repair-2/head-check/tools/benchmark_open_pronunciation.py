"""Offline upstream candidate screening on the public Tencent fixture plan.

Requires isolated .runtime/pronunciation/bench-venv and downloaded checkpoints.
No cloud calls, credentials, course writes, or scoring threshold changes.
"""
import argparse
import dataclasses
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime/pronunciation'
OUT = ROOT / 'artifacts/course-upgrade/pre-push/pronunciation'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['OPENPRONOUNCE_DEVICE'] = 'cpu'
os.environ['OPENPRONOUNCE_TTS'] = 'piper'
os.environ['OPENPRONOUNCE_CACHE_DIR'] = str(RUNTIME / 'openpronounce-tts')
# eSpeak 1.52 cannot initialize from this Windows workspace's non-ASCII path.
ESPEAK = Path(os.environ['LOCALAPPDATA']) / 'CodeWordsBench/espeak-1.52'
os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = str(ESPEAK / 'libespeak-ng.dll')
os.environ['PHONEMIZER_ESPEAK_DATA_PATH'] = str(ESPEAK / 'espeak-ng-data')
os.environ['OPENPRONOUNCE_PHONEME_MODEL'] = str(RUNTIME / 'bench-models/wav2vec2-lv-60-espeak-cv-ft')

def clean(value):
    if isinstance(value, dict): return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [clean(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value): return None
    if hasattr(value, 'item'): return clean(value.item())
    return value

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('candidate', choices=['pronounce-whole', 'pronounce-stream', 'open-phones', 'open-full'])
    parser.add_argument('--repeats', type=int, default=2)
    args = parser.parse_args()
    import numpy as np
    import torch
    torch.set_num_threads(6)
    torch.set_num_interop_threads(1)
    cases = json.loads((OUT / 'tencent-test-plan.json').read_text(encoding='utf-8'))['cases']
    audio = {}
    for case in cases:
        source = ROOT / case['file']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == case['sha256'], case['id']
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
        audio[case['id']] = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    start = time.perf_counter()
    if args.candidate.startswith('pronounce'):
        sys.path.insert(0, str(RUNTIME / 'candidates/pronounce-assess-ad3003275a77'))
        from pronounce_assess import PronounceAssessModel
        model = PronounceAssessModel(model_name=str(RUNTIME / 'bench-models/wav2vec2-xls-r-300m-timit-phoneme'), device='cpu')
        def evaluate(wave, text):
            model.set_sentence(text)
            chunks = [wave]
            if args.candidate == 'pronounce-stream':
                chunks = [wave[i:i+8000] for i in range(0, len(wave), 8000)]
                # Short tail cannot pass the upstream convolution; merge, never trim it.
                if len(chunks) > 1 and len(chunks[-1]) < 400:
                    chunks[-2] = np.concatenate(chunks[-2:]); chunks.pop()
            events = [dataclasses.asdict(e) for e in model.stream_decode(chunks)]
            positions = {e['position'] for e in events if e['position'] is not None}
            return {'referencePhones':model.reference_phonemes, 'events':events,
                    'unscoredPositions':[i for i in range(len(model.reference_phonemes)) if i not in positions],
                    'flagged':any(e['label'] in ['omitted','mispronounced'] for e in events)}
    else:
        sys.path.insert(0, str(RUNTIME / 'candidates/OpenPronounce-74bc17ea406e'))
        from openpronounce import phones, speech, languages, tts
        from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
        # Route original model identifiers to exact local copies, with no algorithm edits.
        original_loader = speech._load_models
        local_word = str(RUNTIME / 'bench-models/wav2vec2-large-960h')
        speech._load_models = lambda name=speech.MODEL_NAME: original_loader(local_word)
        phones._load_model()
        assert phones.get_expected_phones('hello')[1], 'eSpeak returned no reference phones'
        if args.candidate == 'open-full':
            speech._load_models()
            from piper import PiperVoice
            tts._piper_voices['en_US-lessac-medium'] = PiperVoice.load(
                str(ROOT / 'tools/models/en_US-lessac-medium.onnx'),
                str(ROOT / 'tools/models/en_US-lessac-medium.onnx.json'),
                espeak_data_dir=Path(os.environ['LOCALAPPDATA']) / 'CodeWordsBench/piper-1.8/espeak-ng-data')
        def evaluate(wave, text):
            if args.candidate == 'open-full':
                result = speech.compare_audio_with_text(wave, text)
                result['flagged'] = bool(result['differences']['errors'])
                return result
            recognition = phones.recognize_phones(wave)
            result = phones.compare_phones(recognition, text)
            result['wordReports'] = phones._word_reports(recognition, text)
            result['flagged'] = bool(result['errors'])
            return result
    load_ms = (time.perf_counter()-start)*1000
    start = time.perf_counter()
    warmup = evaluate(audio[cases[0]['id']], cases[0]['reference'])
    warmup_ms = (time.perf_counter()-start)*1000
    report = {'candidate':args.candidate, 'device':'CPU Ryzen 5 7500F, 6 torch threads',
              'torch':torch.__version__, 'offline':True, 'audioPcm':'16kHz mono int16 -> float32',
              'modelLoadMs':load_ms, 'firstEvaluationMs':warmup_ms, 'repeats':args.repeats,
              'timing':'Full available waveform/chunks processed unpaced, including native prosody if present; excludes audio decoding and recording.',
              'cases':[]}
    path = OUT / (args.candidate+'-benchmark.json')
    for repeat in range(args.repeats):
        for case in cases:
            start = time.perf_counter()
            result = evaluate(audio[case['id']], case['reference'])
            elapsed = (time.perf_counter()-start)*1000
            row = dict(case, repeat=repeat, computeMs=round(elapsed,2), result=clean(result))
            report['cases'].append(row)
            path.write_text(json.dumps(clean(report), ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
            print(case['id'], 'round',repeat, 'ms',round(elapsed), 'flagged',result['flagged'], flush=True)
    print('saved',path,flush=True)

if __name__ == '__main__': main()
