"""Stage bounded level/padding fixes and reviewed contextual pronunciations.

Original files are read from the verified baseline. Nothing is published by this
tool. Repeated runs reuse files only when the source and recipe hashes agree.
"""
import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np
import edge_tts
from audit_audio_quality import measure
from generate_clear_slow_audio import decode, segments, matched_groups, sha, VOICES, PACKING_REVISION

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.runtime/audio-optimization-20261031'
REPORT=ROOT/'artifacts/audio-optimization-20261031'
STAGE=WORK/'normal'
PROFILE='clear-normal-v1'

def duration_seconds(path):
    result=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)],capture_output=True,check=True,timeout=30)
    return round(float(result.stdout),6)

def encode(pcm,path):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.part')
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','24000','-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','96k','-f','mp3',str(tmp)],input=pcm.astype('<f4').tobytes(),capture_output=True,check=True,timeout=60)
    tmp.replace(path)

def recipe_for(entry,recipes):
    text=entry['text']
    if entry.get('spoken'): return None # Existing tutorial spellings have their own reviewed TTS text.
    if entry['kind']=='daily' and text=='live': return recipes['live@verb']
    if text in recipes:
        recipe=recipes[text]
        if recipe.get('slowOnly'):return None
        return {**{k:v for k,v in recipe.items() if k!='voiceOverrides'},**recipe.get('voiceOverrides',{}).get(entry['voice'],{})}
    spoken=text
    for token in ['MAU','MR','OO','QR','MCPC','NC','OA','IT','AD','US']:
        spoken=re.sub(r'\b'+token+r'\b',recipes[token]['spoken'],spoken)
    if spoken!=text:return {'spoken':spoken}
    return None

async def regenerate(jobs):
    """Batch short contextual words, keeping actual generation text in metadata."""
    raw=WORK/'normal-synthesis';raw.mkdir(exist_ok=True)
    results={}
    for folder,voice in VOICES.items():
        entries=[{**r,'text':e['path']} for e,r in jobs if e['voice']==folder]
        for index in range(0,len(entries),20):
            batch=entries[index:index+20]
            identity=sha(json.dumps({'profile':PROFILE,'voice':voice,'rate':'+0%','entries':batch},sort_keys=True).encode())
            audio=raw/f'{identity}.mp3';metadata=raw/f'{identity}.json'
            if audio.exists() and metadata.exists():
                data=json.loads(metadata.read_text(encoding='utf8'))
                if data['sha256']!=sha(audio.read_bytes()):raise ValueError('Cached normal source hash mismatch')
                boundaries=data['boundaries']
            else:
                spoken='\n\n'.join(e['spoken'].strip().rstrip('.')+'.' for e in batch)
                for attempt in range(5):
                    try:
                        boundaries=[];tmp=audio.with_suffix('.part')
                        with tmp.open('wb') as stream:
                            async for chunk in edge_tts.Communicate(spoken,voice,rate='+0%',boundary='WordBoundary',connect_timeout=30,receive_timeout=90).stream():
                                if chunk['type']=='audio':stream.write(chunk['data'])
                                elif chunk['type']=='WordBoundary':boundaries.append(chunk)
                        matched_groups(batch,boundaries);tmp.replace(audio)
                        metadata.write_text(json.dumps({'sha256':sha(audio.read_bytes()),'boundaries':boundaries}),encoding='utf8');break
                    except Exception as exc:
                        if attempt==4:raise RuntimeError(f'Normal batch {folder}/{index}: {type(exc).__name__}') from None
                        await asyncio.sleep(5*2**attempt)
            for item,pcm,analysis in segments(decode(audio),batch,boundaries):
                results[item['text']]=(pcm,{**analysis,'synthesis':{k:v for k,v in item.items() if k!='text'},'sourceSha256':sha(audio.read_bytes())})
            print(json.dumps({'regeneratedWords':min(index+20,len(entries)),'voice':folder,'total':len(entries)}),flush=True)
    return results

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--levels-only',action='store_true');parser.add_argument('--workers',type=int,default=6);args=parser.parse_args()
    STAGE.mkdir(parents=True,exist_ok=True)
    inventory=json.loads((WORK/'inventory.json').read_text(encoding='utf8'))
    before={x['path']:x for x in map(json.loads,(REPORT/'before.jsonl').read_text(encoding='utf8').splitlines())}
    recipes=json.loads((ROOT/'scripts/audio-pronunciation-recipes.json').read_text(encoding='utf8'))
    jobs=[]
    if not args.levels_only:
        for entry in inventory['entries']:
            recipe=recipe_for(entry,recipes)
            if recipe:jobs.append((entry,recipe))
            elif before[entry['path']]['leadingMs']<10 or before[entry['path']]['trailingMs']<10:
                jobs.append((entry,{'spoken':entry.get('spoken',entry['text'])}))
    regenerated=asyncio.run(regenerate(jobs)) if jobs else {}
    cache=WORK/'normal-processing';cache.mkdir(exist_ok=True)
    def process(entry):
        key=entry['path'];old=before[key];source=WORK/'baseline/public/audio'/key;target=STAGE/key
        if sha(source.read_bytes())!=old['sha256']:raise ValueError(f'Baseline mismatch: {key}')
        recipe=recipe_for(entry,recipes) if key in regenerated else None
        identity=sha(json.dumps({'profile':PROFILE,'source':old['sha256'],'recipe':recipe,'regenerated':key in regenerated,**({'packing':PACKING_REVISION} if key in regenerated else {})},sort_keys=True).encode())
        meta=cache/(sha(key.encode())+'.json')
        if meta.exists() and target.exists():
            record=json.loads(meta.read_text(encoding='utf8'))
            if record['identity']==identity and record['fileSha256']==sha(target.read_bytes()):
                if record['changed'] and 'durationSeconds' not in record:
                    record['durationSeconds']=duration_seconds(target)
                    meta.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
                return record
        info={'gainDb':0.,'addedLeadingMs':0,'addedTrailingMs':0}
        if key in regenerated:
            pcm,info=regenerated[key];encode(pcm,target)
        else:
            gain=old['suggestedGainDb'] if abs(old['suggestedGainDb'])>=1 else 0.
            lead=max(0,60-old['leadingMs']);tail=max(0,80-old['trailingMs'])
            info={'gainDb':gain,'addedLeadingMs':lead,'addedTrailingMs':tail}
            if gain or lead or tail:
                pcm=decode(source)*(10**(gain/20));pcm=np.pad(pcm,(lead*24,tail*24));encode(pcm,target)
            else:
                target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
        changed=sha(target.read_bytes())!=old['sha256']
        measured=measure(target) if changed else {k:old[k] for k in ['durationMs','speechRmsDb','peakDb','suggestedGainDb','leadingMs','trailingMs','clippedSamples']}
        record={'path':key,'identity':identity,'changed':changed,'regenerated':key in regenerated,'originalSha256':old['sha256'],'fileSha256':sha(target.read_bytes()),'bytes':target.stat().st_size,'processing':info,**measured}
        if changed:record['durationSeconds']=duration_seconds(target)
        if record['clippedSamples'] or record['durationMs']<100:raise ValueError(f'Invalid processed audio: {key}')
        meta.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8');return record
    rows=[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i,row in enumerate(pool.map(process,inventory['entries']),1):
            rows.append(row)
            if i%500==0:print(f'Staged {i}/{len(inventory["entries"])}',flush=True)
    # Preserve original synthesis metadata and attach exact processing provenance.
    manifests={}
    for directory in ['', 'daily','reading','foundation']:
        relative=f'{directory}/neural-manifest.json'.lstrip('/')
        manifests[directory]=json.loads((WORK/'baseline/public/audio'/relative).read_text(encoding='utf8'))
    by_entry={x['path']:x for x in inventory['entries']}
    for row in rows:
        entry=by_entry[row['path']];parts=row['path'].split('/');directory=parts[0] if len(parts)==3 else '';key='/'.join(parts[1:]) if directory else row['path']
        records=manifests[directory]['entries'] if directory else manifests[directory]
        voice=VOICES[entry['voice']]
        record=records.setdefault(key,{'voice':voice,'text':entry['text'],'sha256':sha(f'{voice}\n+0%\n{entry["text"]}'.encode())})
        record.update({'fileSha256':row['fileSha256'],'bytes':row['bytes']})
        if row['changed']:
            record.update({'durationSeconds':row['durationSeconds'],'sampleRate':24000,'channels':1,'optimization':{'profile':PROFILE,'originalSha256':row['originalSha256'],**row['processing']}})
    for directory,data in manifests.items():
        (STAGE/directory/'neural-manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (REPORT/'after-normal.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows),encoding='utf8')
    summary={'complete':True,'levelsOnly':args.levels_only,'recordings':len(rows),'changed':sum(x['changed'] for x in rows),'regenerated':len(regenerated),'decodeErrors':0,'clippedSamples':sum(x['clippedSamples'] for x in rows)}
    (REPORT/'normal-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary),flush=True)

if __name__=='__main__':sys.stdout.reconfigure(encoding='utf8');main()
