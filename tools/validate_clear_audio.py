"""Independent English ASR screening of delivered slow clips, without answer prompts."""
import argparse
import array
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from shared_q8 import SharedQ8

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.runtime/audio-optimization-20261031'

def normalize(text): return re.sub(r'[^a-z0-9]','',text.lower())

def audio(path,start=None,end=None):
    command=['ffmpeg','-v','error','-nostdin','-threads','1','-i',str(path)]
    if start is not None:command+=['-ss',str(start/1000),'-t',str((end-start)/1000)]
    command+=['-ar','16000','-ac','1','-f','f32le','-']
    result=subprocess.run(command,capture_output=True,check=True,timeout=30)
    pcm=array.array('f');pcm.frombytes(result.stdout);return pcm

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pilot',action='store_true');parser.add_argument('--all',action='store_true');parser.add_argument('--normal',action='store_true');parser.add_argument('--stage-dir',type=Path);parser.add_argument('--report-dir',type=Path);args=parser.parse_args()
    folder=args.stage_dir or WORK/('normal' if args.normal else 'pilot-slow-060' if args.pilot else 'clear-slow-060')
    manifest_path=ROOT/'artifacts/audio-optimization-20261031/after-normal.jsonl' if args.normal else folder/'manifest.json'
    if args.normal:
        entries={x['path']:x for x in json.loads((WORK/'inventory.json').read_text(encoding='utf8'))['entries']}
        rows=list(map(json.loads,manifest_path.read_text(encoding='utf8').splitlines()))
        completion_path=ROOT/'artifacts/audio-optimization-20261031/reading-completion.json'
        if completion_path.exists():
            completion=json.loads(completion_path.read_text(encoding='utf8'));rows=[r for r in rows if r['path'] not in completion['retired']]
            for item in completion['added']:
                entries[item['path']]={'text':item['text']}
                rows.append({'path':item['path'],'regenerated':True,'processing':{}})
        manifest={'clips':{r['path']:{'path':r['path'],'text':entries[r['path']]['text'],'spoken':entries[r['path']].get('spoken',entries[r['path']]['text']),'regenerated':r['regenerated'],'processing':r['processing']} for r in rows}}
    else:
        manifest=json.loads(manifest_path.read_text(encoding='utf8'))
        manifest['clips'].update({'normal:'+k:v for k,v in manifest.get('normalClips',{}).items()})
    recipes=json.loads((ROOT/'scripts/audio-pronunciation-recipes.json').read_text(encoding='utf8'))
    foundation={x['id']:x['text'] for x in json.loads((ROOT/'src/foundationAudio.json').read_text(encoding='utf8'))}
    report=args.report_dir or ROOT/('artifacts/audio-optimization-20261031' if args.normal else 'artifacts/audio-slow-060-20261101')
    report.mkdir(parents=True,exist_ok=True)
    output=report/('normal-asr.jsonl' if args.normal else 'pilot-asr.jsonl' if args.pilot else 'slow-asr.jsonl')
    done=set()
    import hashlib
    manifest_hash=hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    if output.exists():
        done={x['key'] for x in map(json.loads,output.read_text(encoding='utf8').splitlines()) if x.get('manifestSha256')==manifest_hash}
    started=time.perf_counter();model=SharedQ8()
    print(json.dumps({'backend':model.backend,'loadSeconds':round(time.perf_counter()-started,2),'noReferencePrompt':True}),flush=True)
    jobs=list(manifest['clips'].items())
    if not args.all and not args.pilot:
        # Deterministic spread plus all explicitly contextual pronunciations.
        if args.normal:jobs=[(k,v) for i,(k,v) in enumerate(jobs) if v.get('regenerated') or i%293==0]
        else:jobs=[(k,v) for i,(k,v) in enumerate(jobs) if i%43==0 or '@' in k or re.fullmatch('[A-Z]{2,}',v['text'])]
    try:
        with output.open('a',encoding='utf8') as stream:
            for index,(key,clip) in enumerate(jobs):
                if key in done:continue
                path=folder/clip['path'] if args.normal else folder/Path(clip['path']).relative_to('slow')
                result=model(audio(path,clip.get('startMs'),clip.get('endMs')))
                token=clip['text'];ordinary=token.lower() if re.fullmatch(r'[A-Z][a-z]+',token) else token
                recipe=recipes.get(token,recipes.get(ordinary,{}))
                recipe={**recipe,**recipe.get('voiceOverrides',{}).get(key.split(':')[0],{})}
                expected=recipe.get('targetWord',clip['spoken'])
                if args.normal:expected=clip['processing'].get('synthesis',{}).get('targetWord',clip['text'])
                elif token.startswith('tutorial@'):expected=foundation[token.split('@',1)[1]]
                if '@' in token and not token.startswith('tutorial@'):expected=recipe.get('targetWord',token.split('@')[0])
                actual=normalize(result['transcript']);match=actual==normalize(expected)
                # Homophones are valid transcriptions, but do not establish vowel/stress accuracy.
                aliases={'reed':{'read'},'red':{'read'},'bough':{'bow'},'plane':{'plain'}}
                spelling=not match and normalize(result['transcript'].replace('color','colour'))==normalize(expected.replace('color','colour'))
                row={'key':key,'expected':expected,'manifestSha256':manifest_hash,'audioSha256':hashlib.sha256(path.read_bytes()).hexdigest(),**result,'textMatch':match,'homophoneMatch':not match and actual in aliases.get(expected.lower(),set()),'spellingVariant':spelling}
                stream.write(json.dumps(row,ensure_ascii=False)+'\n');stream.flush()
                if args.pilot or index%50==0:print(json.dumps(row,ensure_ascii=False),flush=True)
    finally:model.close()
    rows=[x for x in map(json.loads,output.read_text(encoding='utf8').splitlines()) if x.get('manifestSha256')==manifest_hash]
    print(json.dumps({'complete':True,'screened':len(rows),'exactNormalizedMatches':sum(x['textMatch']for x in rows),'elapsedSeconds':round(time.perf_counter()-started,2),'assessment':'transcription screening, not phoneme or human listening quality'}),flush=True)

if __name__=='__main__':sys.stdout.reconfigure(encoding='utf8');main()
