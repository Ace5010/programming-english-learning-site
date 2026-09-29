"""Offline regression and held-out word/voice screening for local feedback."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import statistics
import time
import wave

import numpy as np
from local_pronunciation import LocalAssessment, ROOT, VERSION

OUT = ROOT / 'artifacts/course-upgrade/pre-push/pronunciation'
PLAN = OUT / 'open-feedback-holdout-plan.json'
VALIDATION = OUT / 'open-feedback-validation-plan.json'


def prepare(validation=False):
    source = (ROOT/'src/vocabulary.ts').read_text(encoding='utf-8')
    vocabulary = json.loads(source.split('export const vocabulary: VocabularyItem[] = ',1)[1].strip().rstrip(';'))
    ids = {item['word'].lower():item['id'] for item in vocabulary}
    pairs = [('seat','sit'),('heat','hit'),('safe','save'),('pool','pull'),('lock','rock'),('mouth','mouse')] if validation else [('cap','cab'),('coat','goat'),('full','fool'),('cheap','chip'),('back','bag'),('leave','live')]
    cases = []
    for voice in ['aria','guy','piper-lessac']:
        for a,b in pairs:
            for spoken,other in [(a,b),(b,a)]:
                file = f'public/audio/{voice}/word-{ids[spoken]}.mp3'
                sha = hashlib.sha256((ROOT/file).read_bytes()).hexdigest()
                for reference in [spoken, other]:
                    cases.append({'id':f'{voice}-{spoken}-as-{reference}','file':file,'sha256':sha,
                                  'reference':reference,'spokenFixture':spoken,'expectedCorrect':spoken==reference})
    plan = {'status':'fixed-before-inference','containsUserRecording':False,'cases':cases,
            'limitation':'Held-out words and an additional synthetic voice, not human accent validation.'}
    destination=VALIDATION if validation else PLAN
    if destination.exists():
        assert json.loads(destination.read_text(encoding='utf-8')) == plan
    else:
        destination.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    print('held-out plan sealed',len(cases))


def pcm_bytes(audio):
    out = io.BytesIO()
    with wave.open(out, 'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000)
        f.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
    return out.getvalue()


def run():
    parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--validation',action='store_true');args=parser.parse_args()
    if args.prepare:
        prepare(args.validation);return
    assert PLAN.exists(), 'Prepare and seal the holdout plan first'
    report={'version':1,'policyVersion':VERSION,'cloudCalls':0,'engineSha256':hashlib.sha256((ROOT/'tools/local_pronunciation.py').read_bytes()).hexdigest(),'cases':[]}
    start=time.perf_counter();engine=LocalAssessment();report['loadMs']=round((time.perf_counter()-start)*1000)
    output=OUT/'open-feedback-evaluation.json'
    plans=[('regression',OUT/'tencent-test-plan.json'),('development-expanded',PLAN),('validation',VALIDATION)]
    for split, plan in plans:
        for c in json.loads(plan.read_text(encoding='utf-8'))['cases']:
            audio=(ROOT/c['file']).read_bytes();assert hashlib.sha256(audio).hexdigest()==c['sha256']
            result=engine.assess(audio,c['reference']);report['cases'].append(dict(c,split=split,result=result))
            output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(split,c['id'],result['status'],result['elapsedMs'],flush=True)
    rng=np.random.default_rng(42)
    signals={'silence':np.zeros(16000),'noise':rng.normal(0,.05,16000),
             'tone':.1*np.sin(2*np.pi*440*np.arange(16000)/16000)}
    report['controls']={name:engine.assess(pcm_bytes(a),'hello') for name,a in signals.items()}
    report['summary']={}
    for split,_ in plans:
        rows=[r for r in report['cases'] if r['split']==split]
        report['summary'][split]={'count':len(rows),'medianMs':statistics.median(r['result']['elapsedMs'] for r in rows),
          'normal':{s:sum(r['expectedCorrect'] and r['result']['status']==s for r in rows) for s in ['supported','practice','uncertain']},
          'wrong':{s:sum(not r['expectedCorrect'] and r['result']['status']==s for r in rows) for s in ['supported','practice','uncertain']}}
    report['status']='completed-screening-not-production'
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report['summary']))

if __name__=='__main__':run()
