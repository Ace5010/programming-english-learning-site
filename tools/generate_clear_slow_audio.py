"""Synthesize complete slow word recordings, then pack them without browser stretching.

Only writes to .runtime until independently validated. Every boundary is matched
against the submitted text; a mismatch fails the batch rather than dropping words.
"""
import argparse
import asyncio
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import numpy as np
import edge_tts

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.runtime/audio-optimization-20261031'
VOICES={'aria':'en-US-AriaNeural','guy':'en-US-GuyNeural'}
RATE='-40%'
SOURCE_RATE=0.60
SAMPLE_RATE=24000
PACKING_REVISION='protected-edges-v3'

def canonical(text):
    return ''.join(c for c in text.casefold() if c.isalnum())

def sha(data): return hashlib.sha256(data).hexdigest()

def matched_groups(entries,boundaries):
    expected=''.join(canonical(e['spoken']) for e in entries)
    received=''.join(canonical(b['text']) for b in boundaries)
    if expected != received:
        raise ValueError(f'Word boundaries differ from the submitted text: {expected[:160]!r} / {received[:160]!r}')
    groups=[]; cursor=0; index=0
    for entry in entries:
        size=len(canonical(entry['spoken'])); group=[]; used=0
        while used<size and index<len(boundaries):
            boundary=boundaries[index]; length=len(canonical(boundary['text']))
            if used+length>size: raise ValueError('A word boundary crossed a recording boundary')
            group.append(boundary); used+=length; index+=1
        if used!=size or not group: raise ValueError('Incomplete word boundaries')
        groups.append(group); cursor+=size
    if index!=len(boundaries): raise ValueError('Extra word boundaries')
    return groups

def decode(path):
    result=subprocess.run(['ffmpeg','-v','error','-xerror','-nostdin','-threads','1','-i',str(path),'-ac','1','-ar',str(SAMPLE_RATE),'-f','f32le','-'],capture_output=True,check=True,timeout=90)
    return np.frombuffer(result.stdout,dtype='<f4').copy()

def normalized_clip(pcm):
    n=len(pcm)//240
    if not n: raise ValueError('Empty synthesized clip')
    frames=pcm[:n*240].reshape(-1,240)
    rms=np.sqrt(np.mean(frames.astype(np.float64)**2,axis=1))
    active=np.flatnonzero(rms>.00398)
    if not len(active): raise ValueError('Silent synthesized clip')
    start=max(0,int(active[0])*240-1920); end=min(len(pcm),(int(active[-1])+1)*240+2400)
    clip=pcm[start:end].copy()
    level=20*math.log10(float(np.sqrt(np.mean(frames[active].astype(np.float64)**2)))+1e-12)
    peak=20*math.log10(float(np.max(np.abs(clip)))+1e-12)
    gain=min(6.,-20.-level,-1.5-peak)
    clip*=10**(gain/20)
    # Fixed protections survive slow word sequencing and MP3 encoder delay.
    lead=max(0,1920-(int(active[0])*240-start)); tail=max(0,2400-(end-(int(active[-1])+1)*240))
    clip=np.pad(clip,(lead,tail))
    return clip.astype('<f4'),{'leadingMs':80,'trailingMs':100,'gainDb':round(gain,2)}

def segments(pcm,entries,boundaries):
    groups=matched_groups(entries,boundaries)
    for entry,group in zip(entries,groups):
        if '_audioPath' in entry:
            result=subprocess.run(['ffmpeg','-v','error','-i',entry['_audioPath'],'-af',f'atempo={SOURCE_RATE}','-ar',str(SAMPLE_RATE),'-ac','1','-f','f32le','-'],capture_output=True,check=True,timeout=60)
            pcm_source=np.frombuffer(result.stdout,dtype='<f4').copy()
            segment,analysis=normalized_clip(pcm_source)
            yield entry,segment,analysis
            continue
        first,last=group[0],group[-1]
        selected=group
        contextual='targetIndex' in entry
        if contextual:
            if not isinstance(entry['targetIndex'],int) or not 0<=entry['targetIndex']<len(group):raise ValueError(f'Context target outside boundaries: {entry["text"]}')
            chosen=group[entry['targetIndex']]
            target_word=entry.get('targetWord',entry['text'].split('@')[0])
            if canonical(chosen['text']) != canonical(target_word): raise ValueError(f'Wrong contextual target: {entry["text"]}')
            selected=[chosen]; first=last=chosen
        begin=first['offset']/1e7; end=(last['offset']+last['duration'])/1e7
        previous=boundaries[boundaries.index(first)-1] if boundaries.index(first)>0 else None
        following=boundaries[boundaries.index(last)+1] if boundaries.index(last)+1<len(boundaries) else None
        left=max(0.,begin-(.06 if contextual else .12))
        right=min(len(pcm)/SAMPLE_RATE,end+(entry.get('tailMs',30)/1000 if contextual else .16))
        if previous: left=max(left,((previous['offset']+previous['duration'])/1e7+begin)/2)
        if following and 'tailMs' not in entry: right=min(right,(end+following['offset']/1e7)/2)
        segment=pcm[round(left*SAMPLE_RATE):round(right*SAMPLE_RATE)]
        segment,analysis=normalized_clip(segment)
        if not 100<len(segment)/24<30000: raise ValueError(f'Implausible duration: {entry["text"]}')
        yield entry,segment,analysis

def pack(source,entries,boundaries,target):
    pcm=decode(source)
    parts=[]; clips={}; length=0
    for entry,segment,analysis in segments(pcm,entries,boundaries):
        start=round(length/24); length+=len(segment)
        clips[entry['text']]={'startMs':start,'endMs':round(length/24),'leadingMs':analysis['leadingMs'],'trailingMs':analysis['trailingMs'],'spoken':entry['spoken'],'gainDb':analysis['gainDb']}
        parts.extend([segment,np.zeros(2400,dtype='<f4')]); length+=2400
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_suffix('.part')
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SAMPLE_RATE),'-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','96k','-f','mp3',str(temporary)],input=np.concatenate(parts).astype('<f4').tobytes(),capture_output=True,check=True,timeout=90)
    # Decode the encoded file as well; all bounds must fit the delivered MP3.
    delivered=decode(temporary)
    if len(delivered)<length-48: raise ValueError('Encoded pack is shorter than its final boundary')
    temporary.replace(target)
    return clips

async def generate(args):
    source=ROOT/'src/slowReadingInventory.json'
    inventory_data=source.read_bytes()
    inventory=json.loads(inventory_data)
    entries=inventory['entries']
    recipes_path=ROOT/'scripts/audio-pronunciation-recipes.json'
    recipes_data=recipes_path.read_bytes()
    recipes=json.loads(recipes_data)
    prepared=[]
    for entry in entries:
        key=entry['text']; ordinary=key.lower() if re.fullmatch(r'[A-Z][a-z]+',key) else key
        recipe=recipes.get(key,recipes.get(ordinary))
        prepared.append({**entry,**(recipe or {})})
    if args.pilot:
        chosen=['repository','function','variable','student','teacher','from','think','three','live@verb','live@adjective','record@verb','record@noun','read@present','read@past','C++','Node.js','US',"What's",'SQL','API']
        prepared=[e for name in chosen for e in prepared if e['text']==name]
    batches=[]; current=[]
    for entry in prepared:
        if current and (len(current)>=40 or sum(len(x['spoken'].encode('utf8'))+4 for x in current)+len(entry['spoken'].encode('utf8'))>3200):
            batches.append(current); current=[]
        current.append(entry)
    if current:batches.append(current)
    output=args.output_dir or WORK/('pilot-slow-060' if args.pilot else 'clear-slow-060')
    output.mkdir(parents=True,exist_ok=True)
    raw=WORK/'synthesis-cache'; raw.mkdir(exist_ok=True)
    semaphore=asyncio.Semaphore(args.workers); done=0;source_overrides={}
    async def task(folder,voice,index,batch,rate=RATE,normal=False):
        nonlocal done
        batch=[{**{k:v for k,v in e.items() if k!='voiceOverrides'},**e.get('voiceOverrides',{}).get(folder,{})} for e in batch]
        for entry in batch:
            if entry.get('audioSource') and not normal:
                relative=Path(entry['audioSource']);path=(args.normal_assets/relative).resolve();path.relative_to(args.normal_assets.resolve())
                if not re.fullmatch(r'(?:(?:foundation|reading|daily)/)?'+folder+r'/[a-z0-9-]+\.mp3',relative.as_posix()):raise ValueError('Unsafe fallback source')
                entry['audioSourceSha256']=sha(path.read_bytes());entry['_audioPath']=str(path)
                source_overrides[f'{folder}:{entry["text"]}']={'path':relative.as_posix(),'sha256':entry['audioSourceSha256'],'method':'pitch-preserving-tempo','rate':SOURCE_RATE}
        spoken='\n\n'.join(e['spoken'].strip().rstrip('.')+'.' for e in batch)
        identity=sha(json.dumps({'profile':'clear-slow-v2','rate':rate,'voice':voice,'entries':batch},sort_keys=True,ensure_ascii=False).encode())
        packing_identity=sha((identity+PACKING_REVISION).encode())
        source_audio=raw/f'{identity}.mp3'; meta=raw/f'{identity}.json'
        target=output/f'{folder}/pack-v2-{"normal-" if normal else ""}{index}.mp3'; cached=target.with_suffix('.json')
        if cached.exists() and target.exists():
            record=json.loads(cached.read_text(encoding='utf8'))
            if record['identity']==packing_identity and record['sha256']==sha(target.read_bytes()): return folder,target,record
        async with semaphore:
            if source_audio.exists() and meta.exists():
                capture=json.loads(meta.read_text(encoding='utf8'))
                if capture['sha256']!=sha(source_audio.read_bytes()):raise ValueError('Cached synthesis hash differs')
                boundaries=capture['boundaries']
            else:
                for attempt in range(5):
                    try:
                        boundaries=[]; temporary=source_audio.with_suffix('.part')
                        async def request():
                            with temporary.open('wb') as stream:
                                async for chunk in edge_tts.Communicate(spoken,voice,rate=rate,boundary='WordBoundary',connect_timeout=30,receive_timeout=90).stream():
                                    if chunk['type']=='audio':stream.write(chunk['data'])
                                    elif chunk['type']=='WordBoundary':boundaries.append(chunk)
                        await asyncio.wait_for(request(),120)
                        matched_groups(batch,boundaries)
                        temporary.replace(source_audio)
                        meta.write_text(json.dumps({'sha256':sha(source_audio.read_bytes()),'boundaries':boundaries},ensure_ascii=False),encoding='utf8')
                        break
                    except Exception as exc:
                        if attempt==4: raise RuntimeError(f'{folder}/{index}: {type(exc).__name__}') from None
                        print(f'Retry {folder}/{index}: {type(exc).__name__}',flush=True)
                        await asyncio.sleep(5*2**attempt)
            clips=await asyncio.to_thread(pack,source_audio,batch,boundaries,target)
            record={'identity':packing_identity,'synthesisIdentity':identity,'packingRevision':PACKING_REVISION,'sourceSha256':sha(source_audio.read_bytes()),'sha256':sha(target.read_bytes()),'bytes':target.stat().st_size,'clips':clips}
            cached.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
            done+=1
            if done%10==0 or args.pilot: print(json.dumps({'completedPacks':done,'totalPacks':len(batches)*2,'voice':folder,'units':len(batch)}),flush=True)
            return folder,target,record
    results=await asyncio.gather(*(task(folder,voice,i,batch) for folder,voice in VOICES.items() for i,batch in enumerate(batches)),return_exceptions=True)
    failures=[str(x).split('https:')[0].split('wss:')[0][:200] for x in results if isinstance(x,Exception)]
    if failures:
        (output/'failures.json').write_text(json.dumps(failures,indent=2),encoding='utf8')
        raise RuntimeError(f'{len(failures)} packs incomplete; successful packs are cached, see failures.json')
    contextual=[e for e in prepared if '@' in e['text'] and not e['text'].startswith('tutorial@')]
    normal_results=await asyncio.gather(*(task(folder,voice,0,contextual,'+0%',True) for folder,voice in VOICES.items()))
    if source.read_bytes()!=inventory_data or recipes_path.read_bytes()!=recipes_data:
        raise RuntimeError('Source inventory/recipes changed during generation; rerun to reuse valid packs and update changed ones')
    manifest={'version':2,'profile':'clear-slow-v2','synthesisRate':RATE,'playbackRate':1,'inventorySha256':sha(inventory_data),'recipesSha256':sha(recipes_data),'clips':{},'files':{}}
    runtime={}; normal_runtime={};manifest['normalClips']={};manifest['normalSynthesisRate']='+0%';manifest['sourceOverrides']=source_overrides
    for folder,path,record in results:
        relative='slow/'+path.relative_to(output).as_posix(); manifest['files'][relative]={'sha256':record['sha256'],'bytes':record['bytes']}
        for key,clip in record['clips'].items():
            bounds={k:clip[k] for k in ['startMs','endMs','leadingMs','trailingMs']}
            manifest['clips'][f'{folder}:{key}']={'path':relative,'text':key,'spoken':clip['spoken'],'voice':VOICES[folder],**bounds}
            runtime[f'{folder}:{key}']={'path':relative,**bounds,'version':record['sha256'][:16]}
    for folder,path,record in normal_results:
        relative='slow/'+path.relative_to(output).as_posix();manifest['files'][relative]={'sha256':record['sha256'],'bytes':record['bytes']}
        for key,clip in record['clips'].items():
            bounds={k:clip[k] for k in ['startMs','endMs','leadingMs','trailingMs']}
            manifest['normalClips'][f'{folder}:{key}']={'path':relative,'text':key,'spoken':clip['spoken'],'voice':VOICES[folder],**bounds}
            normal_runtime[f'{folder}:{key}']={'path':relative,**bounds,'version':record['sha256'][:16]}
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (output/'runtime.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (output/'normal-runtime.json').write_text(json.dumps(normal_runtime,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'complete':True,'units':len(prepared),'voiceClips':len(runtime),'packs':len(manifest['files']),'output':str(output)},ensure_ascii=False),flush=True)

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf8')
    parser=argparse.ArgumentParser();parser.add_argument('--pilot',action='store_true');parser.add_argument('--workers',type=int,default=4);parser.add_argument('--normal-assets',type=Path,default=ROOT/'public/audio');parser.add_argument('--output-dir',type=Path);args=parser.parse_args()
    if not 1<=args.workers<=8:parser.error('--workers must be 1..8')
    asyncio.run(generate(args))
