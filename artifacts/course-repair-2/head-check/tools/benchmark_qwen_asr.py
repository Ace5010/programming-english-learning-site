"""Offline, audio-only Qwen3-ASR screening; transcription is not phone grading.

Use the publisher's Transformers backend from its wheel, without importing the
optional Japanese/Korean forced-aligner or web server dependencies. Input prompt
and generation match qwen-asr 0.0.6's _infer_asr_transformers (empty context).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import sys
import time
import types
import zipfile

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
    HF_HUB_DISABLE_TELEMETRY='1', TORCH_FORCE_WEIGHTS_ONLY_LOAD='1')
import numpy as np
import torch
from local_pronunciation import ROOT, RUNTIME, decode
from benchmark_replacement_pronunciation import block_network

OUT = ROOT/'artifacts/course-upgrade/pre-push/pronunciation'


def normalized(text):
    value = re.sub(r'[^a-z0-9 ]', '', text.lower()).strip()
    if value == '3':
        value = 'three'
    return ' '.join(value.split())


def load():
    folder = RUNTIME/'bench-models/Qwen3-ASR-1.7B'
    manifest = json.loads((folder/'download-manifest.json').read_text(encoding='utf-8'))
    for name, record in manifest['files'].items():
        with (folder/name).open('rb') as stream:
            assert hashlib.file_digest(stream,'sha256').hexdigest()==record['sha256'], name
    wheel = RUNTIME/'wheels/qwen_asr-0.0.6-py3-none-any.whl'
    with wheel.open('rb') as stream:
        wheel_sha = hashlib.file_digest(stream,'sha256').hexdigest()
    source = RUNTIME/'qwen-asr-backend-0.0.6'
    with zipfile.ZipFile(wheel) as archive:
        for name in archive.namelist():
            if name.startswith('qwen_asr/core/transformers_backend/') and name.endswith('.py'):
                path = source/name
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(archive.read(name))
    # Namespace packages isolate the official backend from unused web/alignment
    # imports. No publisher model or processor code is altered.
    for name, path in [('qwen_asr',source/'qwen_asr'),('qwen_asr.core',source/'qwen_asr/core')]:
        package = types.ModuleType(name)
        package.__path__ = [str(path)]
        sys.modules[name] = package
    from qwen_asr.core.transformers_backend import Qwen3ASRForConditionalGeneration, Qwen3ASRProcessor
    processor = Qwen3ASRProcessor.from_pretrained(str(folder),local_files_only=True)
    model, loading = Qwen3ASRForConditionalGeneration.from_pretrained(str(folder),
        local_files_only=True, torch_dtype=torch.float32, attn_implementation='sdpa',
        output_loading_info=True)
    assert not loading['missing_keys'] and not loading['unexpected_keys'], loading
    model.eval()
    messages = [{'role':'system','content':''},
                {'role':'user','content':[{'type':'audio','audio':''}]}]
    prompt = processor.apply_chat_template(messages,add_generation_prompt=True,tokenize=False)
    prompt += 'language English<asr_text>'
    def run(audio):
        started=time.perf_counter()
        batch=processor(text=[prompt],audio=[audio],return_tensors='pt',padding=True)
        with torch.inference_mode():
            # Publisher generate() already sets return_dict_in_generate internally.
            outputs=model.generate(**batch,max_new_tokens=96,do_sample=False)
        ids=outputs.sequences[:,batch['input_ids'].shape[1]:]
        text=processor.batch_decode(ids,skip_special_tokens=True,clean_up_tokenization_spaces=False)[0]
        return {'transcript':text,'normalized':normalized(text),
                'modelMs':round((time.perf_counter()-started)*1000),
                'generatedTokens':int(ids.shape[1]),'truncated':ids.shape[1]>=96}
    return run,manifest,wheel_sha


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--authorized-private',action='store_true')
    args=parser.parse_args()
    torch.set_num_threads(6);torch.set_num_interop_threads(1)
    sys.addaudithook(block_network)
    start=time.perf_counter()
    run,manifest,wheel_sha=load()
    report={'model':'Qwen/Qwen3-ASR-1.7B','source':'ModelScope',
            'files':manifest['files'],'backendWheelSha256':wheel_sha,
            'dtype':'float32','language':'English','referencePrompt':False,
            'networkDisabled':True,'cloudCalls':0,'pronunciationAssessment':False,
            'loadMs':round((time.perf_counter()-start)*1000),'cases':[]}
    target=OUT/'qwen3-asr-screening.json'
    run(decode((ROOT/'public/audio/daily/aria/goodbye.mp3').read_bytes()))
    print('model-ready',flush=True)
    if args.authorized_private:
        private={'model':report['model'],'networkDisabled':True,'cases':[]}
        for word in ['goodbye','three']:
            audio=decode((RUNTIME/'private-diagnostic'/f'user-{word}.weba').read_bytes())
            results=[run(audio) for _ in range(3)]
            private['cases'].append({'reference':word,'results':results})
            print('private',word,json.dumps(results,ensure_ascii=True),flush=True)
        (RUNTIME/'private-diagnostic/qwen3-asr-screening.json').write_text(
            json.dumps(private,ensure_ascii=False,indent=2),encoding='utf-8')
    plan=json.loads((OUT/'tencent-test-plan.json').read_text(encoding='utf-8'))['cases']
    plan+=json.loads((OUT/'replacement-human-plan.json').read_text(encoding='utf-8'))['cases']
    cache={}
    for case in plan:
        data=(ROOT/case['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest()==case['sha256']
        if case['file'] not in cache:cache[case['file']]=run(decode(data))
        result=dict(cache[case['file']])
        result['referenceTextMatch']=result['normalized']==normalized(case['reference'])
        if 'spokenFixture' in case:
            result['spokenWordMatch']=result['normalized']==normalized(case['spokenFixture'])
        report['cases'].append(dict(case,result=result))
        target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(case['id'],json.dumps(result,ensure_ascii=True),flush=True)
    report['controls']={name:run(wave) for name,wave in [
        ('silence',np.zeros(16000,dtype=np.float32)),
        ('noise',np.random.default_rng(42).normal(0,.01,16000).astype(np.float32)),
        ('tone',(.1*np.sin(2*np.pi*440*np.arange(16000)/16000)).astype(np.float32))]}
    report['status']='component-screen-complete-not-graded'
    report['medianModelMsUniqueInputs']=statistics.median(x['modelMs'] for x in cache.values())
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(report['status'],report['medianModelMsUniqueInputs'],flush=True)


if __name__=='__main__':
    main()
