"""Full decode and bounded loudness audit; creates a verified recoverable baseline.

Uses the project's existing slow-audio NumPy/FFmpeg environment. Never changes
public assets. Subsequent processing must compare baseline hashes before writes.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.runtime/audio-optimization-20261031'
REPORT = ROOT / 'artifacts/audio-optimization-20261031'

def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()

def measure(path):
    decoded = subprocess.run(['ffmpeg','-v','error','-xerror','-nostdin','-threads','1','-i',str(path),'-ac','1','-ar','24000','-f','f32le','-'], capture_output=True, check=True, timeout=45)
    pcm = np.frombuffer(decoded.stdout, dtype='<f4')
    if not len(pcm) or not np.isfinite(pcm).all(): raise ValueError('Empty or nonfinite decoded samples')
    frames = pcm[:len(pcm)//240*240].reshape(-1,240)
    rms = np.sqrt(np.mean(frames.astype(np.float64)**2,axis=1))
    active = np.flatnonzero(rms > .00398)  # -48 dBFS, 10 ms windows
    if not len(active): raise ValueError('No speech energy')
    speech = frames[active].astype(np.float64)
    level = 20*math.log10(float(np.sqrt(np.mean(speech**2)))+1e-12)
    peak = 20*math.log10(float(np.max(np.abs(pcm)))+1e-12)
    # Avoid excessive boosting and preserve at least 1.5 dB peak headroom.
    gain = min(6., -20.-level, -1.5-peak)
    return {'durationMs':round(len(pcm)/24), 'speechRmsDb':round(level,2), 'peakDb':round(peak,2), 'suggestedGainDb':round(gain,2), 'leadingMs':int(active[0])*10, 'trailingMs':round(len(pcm)/24)-(int(active[-1])+1)*10, 'clippedSamples':int(np.count_nonzero(np.abs(pcm)>=.999))}

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--workers',type=int,default=6); args=parser.parse_args()
    REPORT.mkdir(parents=True,exist_ok=True)
    inventory=json.loads((WORK/'inventory.json').read_text(encoding='utf8'))
    baseline=WORK/'baseline'; baseline.mkdir(parents=True,exist_ok=True)
    targets=[p for p in (ROOT/'public/audio').rglob('*') if p.is_file() and not p.name.endswith('.part') and 'piper-lessac' not in p.parts]
    for name in ['src/slowReadingInventory.json','src/slowReadingClips.json','src/slowPronunciations.ts','src/App.tsx','src/readingAudio.ts','src/foundationAudio.ts']:
        targets.append(ROOT/name)
    manifest={}
    for path in targets:
        relative=path.relative_to(ROOT).as_posix(); saved=baseline/relative
        if not saved.exists(): saved.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(path,saved)
        current=digest(path)
        if digest(saved)!=current: raise ValueError(f'Baseline differs from live file: {relative}')
        manifest[relative]={'sha256':current,'bytes':path.stat().st_size}
    (REPORT/'baseline.json').write_text(json.dumps({'files':manifest,'backup':str(baseline)},indent=2),encoding='utf8')
    print(json.dumps({'backupVerified':len(manifest),'normalRecordings':len(inventory['entries'])}),flush=True)
    output=REPORT/'before.jsonl'; existing={}
    if output.exists(): existing={x['path']:x for x in map(json.loads,output.read_text(encoding='utf8').splitlines())}
    jobs=[e for e in inventory['entries'] if e['path'] not in existing or 'error' in existing[e['path']]]
    def check(entry):
        path=ROOT/'public/audio'/entry['path']
        try: return {**entry, 'sha256':digest(path), **measure(path)}
        except Exception as exc: return {**entry,'error':type(exc).__name__+': '+str(exc)[:200]}
    with output.open('a',encoding='utf8') as stream, ThreadPoolExecutor(max_workers=args.workers) as pool:
        for index,result in enumerate(pool.map(check,jobs),1):
            stream.write(json.dumps(result,ensure_ascii=False)+'\n'); stream.flush()
            if index%500==0 or index==len(jobs): print(f'Decoded {len(existing)+index}/{len(inventory["entries"])}',flush=True)
    records=list({r['path']:r for r in map(json.loads,output.read_text(encoding='utf8').splitlines())}.values())
    output.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records),encoding='utf8')
    good=[r for r in records if 'error' not in r]
    summary={'records':len(records),'decodeErrors':[r for r in records if 'error'in r], 'gainCandidates':sum(abs(r['suggestedGainDb'])>=1 for r in good),'clippingCandidates':sum(r['clippedSamples']>0 for r in good),'shortStartCandidates':sum(r['leadingMs']<30 for r in good),'shortEndCandidates':sum(r['trailingMs']<40 for r in good)}
    (REPORT/'audit-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8'); print(json.dumps(summary,ensure_ascii=False),flush=True)

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf8'); main()
