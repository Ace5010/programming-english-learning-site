"""Compare cached local ASR on frozen public follow-reading inputs.

No private recordings, course answers, hotwords, cloud inference, or course writes.
Downloads only explicitly selected public corpus clips during --prepare. Inference
is offline and uses the same decoded waveform and speech gate for every model.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import sys
import time

import numpy as np
from faster_whisper.vad import get_speech_timestamps
from local_pronunciation import ROOT, RUNTIME, decode
from sensevoice_recognition import VAD

OUT = ROOT / 'artifacts/asr-replacement-20261004'
CORPUS = RUNTIME / 'speechocean'
REVISION = '613968e3b0b789fc33936fb5eba1973176ba7d11'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def normalize(text):
    text = text.lower().replace('’', "'")
    for before, after in {"what's": 'what is', "i'm": 'i am', "it's": 'it is',
                          "don't": 'do not', "can't": 'can not'}.items():
        text = text.replace(before, after)
    numbers = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split()
    return [numbers[int(word)] if word.isdigit() and int(word) <= 20 else word
            for word in re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text)]


def distance(reference, heard):
    row = list(range(len(heard) + 1))
    for i, word in enumerate(reference, 1):
        next_row = [i]
        for j, candidate in enumerate(heard, 1):
            next_row.append(min(row[j] + 1, next_row[j - 1] + 1,
                                row[j - 1] + (word != candidate)))
        row = next_row
    return row[-1]


def prepare():
    if (OUT / 'plan.json').exists():
        raise RuntimeError('Frozen plan already exists; do not change selection after seeing results')
    cases = []
    daily = read_json(ROOT / 'public/audio/daily/neural-manifest.json')['entries']
    programming = read_json(ROOT / 'public/audio/neural-manifest.json')
    daily_ids = ['whats-your-name', 'my-name-is-ben', 'my-name-is-mia',
                 'where-are-you-from', 'from-china', 'are-you-from-china']
    programming_ids = [1, 7, 11, 3561, 3563, 3564]
    for voice in ['aria', 'guy']:
        for phrase in daily_ids:
            key = f'{voice}/{phrase}.mp3'
            cases.append({'id': f'daily-{voice}-{phrase}', 'group': 'daily',
                          'file': f'public/audio/daily/{key}', 'reference': daily[key]['text']})
        for number in programming_ids:
            key = f'{voice}/example-{number}.mp3'
            cases.append({'id': f'programming-{voice}-{number}', 'group': 'programming',
                          'file': f'public/audio/{key}', 'reference': programming[key]['text']})
        for word, number in [('tree', 2441), ('three', 2400), ('bed', 1291), ('bad', 2978)]:
            cases.append({'id': f'word-{voice}-{word}', 'group': 'word',
                          'file': f'public/audio/{voice}/word-{number}.mp3', 'reference': word})

    prior = read_json(ROOT / 'artifacts/course-upgrade/pre-push/pronunciation/replacement-human-plan.json')
    used_speakers = {case['speaker'] for case in prior['cases']}
    ages = dict(line.split() for line in (CORPUS / 'test/spk2age').read_text().splitlines())
    speakers = dict(line.split() for line in (CORPUS / 'test/utt2spk').read_text().splitlines())
    waves = dict(line.split() for line in (CORPUS / 'test/wav.scp').read_text().splitlines())
    scores = read_json(CORPUS / 'resource/scores.json')
    tree = {item['path']: item for item in read_json(CORPUS / 'tree.json')['tree']}
    selected = []
    counts = Counter()
    for key in sorted(waves):
        speaker = speakers[key]
        score = scores[key]
        if (speaker in used_speakers or int(ages[speaker]) < 18 or counts[speaker] >= 2
                or score['accuracy'] < 8
                or any(phone < 1 for word in score['words'] for phone in word['phones-accuracy'])):
            continue
        selected.append({'id': f'human-{key}', 'group': 'human-new',
                         'file': (CORPUS / waves[key]).relative_to(ROOT).as_posix(),
                         'reference': score['text'], 'speaker': speaker, 'age': int(ages[speaker]),
                         'expertAccuracy': score['accuracy'], 'gitBlobSha1': tree[waves[key]]['sha'],
                         'download': f'https://raw.githubusercontent.com/jimbozhang/speechocean762/{REVISION}/{waves[key]}'})
        counts[speaker] += 1
        if len(selected) == 24:
            break
    if len(selected) != 24:
        raise RuntimeError('Not enough independent adult samples')
    # Fix all choices before downloading or running any recognizer.
    plan = {'status': 'prepared', 'containsUserRecording': False, 'referencePrompt': False,
            'source': 'https://github.com/jimbozhang/speechocean762', 'revision': REVISION,
            'selection': 'Sorted test IDs; age >=18; accuracy >=8; all phone scores >=1; '
                         'max 2 per speaker; excludes every speaker used in previous 24-case screen',
            'cases': cases + selected}
    save(OUT / 'selection.json', plan)
    import requests
    session = requests.Session()
    session.trust_env = False
    for case in plan['cases']:
        path = ROOT / case['file']
        if not path.is_file():
            response = session.get(case['download'], timeout=25)
            response.raise_for_status()
            data = response.content
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            if blob != case['gitBlobSha1']:
                raise RuntimeError('Public fixture hash mismatch')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        data = path.read_bytes()
        case['sha256'] = sha(data)
        wave = decode(data)
        case['durationSeconds'] = round(len(wave) / 16000, 3)
    save(OUT / 'plan.json', plan)
    print(json.dumps({'prepared': len(plan['cases']), 'groups': dict(Counter(x['group'] for x in plan['cases']))}), flush=True)


def load_model(name):
    if name == 'sensevoice':
        from benchmark_sensevoice import load
        run, manifest, _ = load()
        return run, {'model': manifest['repo'], 'dtype': 'float32'}
    if name == 'qwen':
        import torch
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        from benchmark_qwen_asr import load
        run, manifest, _ = load()
        return run, {'model': manifest['repo'], 'dtype': 'float32'}
    from faster_whisper import WhisperModel
    size = name.removeprefix('whisper-')
    snapshots = Path.home() / f'.cache/huggingface/hub/models--Systran--faster-whisper-{size}/snapshots'
    folders = sorted(path for path in snapshots.iterdir() if (path / 'model.bin').is_file())
    if len(folders) != 1:
        raise RuntimeError('Expected exactly one complete cached Whisper snapshot')
    model = WhisperModel(str(folders[0]), device='cpu', compute_type='int8',
                         cpu_threads=6, num_workers=1, local_files_only=True)

    def run(audio):
        start = time.perf_counter()
        segments, _ = model.transcribe(audio, language='en', beam_size=5, temperature=0,
                                       condition_on_previous_text=False, vad_filter=False,
                                       initial_prompt=None, hotwords=None)
        segments = list(segments)
        return {'transcript': ' '.join(segment.text.strip() for segment in segments),
                'modelMs': round((time.perf_counter() - start) * 1000)}
    return run, {'model': f'Systran/faster-whisper-{size}', 'revision': folders[0].name, 'dtype': 'int8'}


def benchmark(name):
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
    from benchmark_replacement_pronunciation import block_network
    sys.addaudithook(block_network)
    plan_path = OUT / 'plan.json'
    plan = read_json(plan_path)
    start = time.perf_counter()
    run, metadata = load_model(name)
    load_ms = round((time.perf_counter() - start) * 1000)
    run(decode((ROOT / 'public/audio/daily/aria/goodbye.mp3').read_bytes()))
    print('model-ready', name, load_ms, flush=True)
    report = {'status': 'running', **metadata, 'loadMs': load_ms, 'planSha256': sha(plan_path.read_bytes()),
              'containsUserRecording': False, 'referencePrompt': False, 'cloudCalls': 0,
              'networkDisabled': True, 'pronunciationAssessment': False, 'cases': []}
    target = OUT / f'{name}.json'
    for index, case in enumerate(plan['cases'], 1):
        data = (ROOT / case['file']).read_bytes()
        if sha(data) != case['sha256']:
            raise RuntimeError('Frozen fixture changed')
        audio = decode(data)
        result = run(audio) if get_speech_timestamps(audio, VAD) else {'transcript': '', 'modelMs': 0, 'noSpeech': True}
        expected, heard = normalize(case['reference']), normalize(result['transcript'])
        result.update(exact=expected == heard, wordErrors=distance(expected, heard), referenceWords=len(expected))
        report['cases'].append({**case, 'result': result})
        save(target, report)
        print(name, index, case['id'], result['exact'], result['modelMs'], repr(result['transcript']), flush=True)
    report['controls'] = {}
    for label, audio in [('silence', np.zeros(16000, dtype=np.float32)),
                         ('noise', np.random.default_rng(42).normal(0, .01, 16000).astype(np.float32)),
                         ('tone', (.1 * np.sin(2 * np.pi * 440 * np.arange(16000) / 16000)).astype(np.float32))]:
        report['controls'][label] = run(audio) if get_speech_timestamps(audio, VAD) else {'transcript': '', 'modelMs': 0, 'noSpeech': True}
    summarize(report)
    report['status'] = 'complete-public-screen-not-user-acceptance'
    save(target, report)
    print(json.dumps({'model': name, 'summary': report['summary']}), flush=True)


def summarize(report):
    # Re-score stored outputs without running inference when representation handling changes.
    report['normalization'] = 'Case/punctuation; common contractions; cardinal digits 0-20'
    for case in report['cases']:
        expected, heard = normalize(case['reference']), normalize(case['result']['transcript'])
        case['result'].update(exact=expected == heard, wordErrors=distance(expected, heard), referenceWords=len(expected))
    report['summary'] = {}
    for group in sorted({x['group'] for x in report['cases']}):
        results = [case['result'] for case in report['cases'] if case['group'] == group]
        report['summary'][group] = {'exact': sum(x['exact'] for x in results), 'total': len(results),
            'wordErrorRate': round(sum(x['wordErrors'] for x in results) / sum(x['referenceWords'] for x in results), 4),
            'medianModelMs': statistics.median(x['modelMs'] for x in results)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--summarize', action='store_true')
    parser.add_argument('--model', choices=['sensevoice', 'whisper-small', 'whisper-large-v3', 'qwen'])
    args = parser.parse_args()
    if args.prepare:
        prepare()
    elif args.summarize:
        for path in sorted(OUT.glob('*.json')):
            report = read_json(path)
            if report.get('status') != 'complete-public-screen-not-user-acceptance':
                continue
            summarize(report)
            save(path, report)
            print(path.stem, json.dumps(report['summary']), flush=True)
    elif args.model:
        benchmark(args.model)
    else:
        parser.error('Choose --prepare or --model')
