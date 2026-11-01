"""Apply the verified local stage; retain a rollback journal and original assets."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.runtime/audio-optimization-20261031'
REPORT=ROOT/'artifacts/audio-optimization-20261031'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_text(encoding='utf8'))
def inside(path,parent):
    path=path.resolve();path.relative_to(parent.resolve());return path
def atomic_copy(source,target):
    target.parent.mkdir(parents=True,exist_ok=True)
    tmp=target.with_name(target.name+'.clear-part');shutil.copy2(source,tmp);tmp.replace(target)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    normal=read(REPORT/'normal-summary.json')
    if not normal['complete'] or normal['levelsOnly']:raise ValueError('Normal stage is incomplete')
    baseline=read(REPORT/'baseline.json')['files']
    manifest=read(WORK/'clear-slow/manifest.json');runtime=read(WORK/'clear-slow/runtime.json')
    normal_runtime=read(WORK/'clear-slow/normal-runtime.json')
    if manifest['version']!=2 or manifest['inventorySha256']!=digest(ROOT/'src/slowReadingInventory.json') or manifest['recipesSha256']!=digest(ROOT/'scripts/audio-pronunciation-recipes.json'):raise ValueError('Slow stage is stale')
    inventory=read(ROOT/'src/slowReadingInventory.json')
    if len(manifest['clips'])!=len(inventory['entries'])*2 or len(runtime)!=len(manifest['clips']):raise ValueError('Incomplete slow voice coverage')
    for key,clip in manifest['clips'].items():
        bounds={k:clip[k] for k in ['path','startMs','endMs','leadingMs','trailingMs']};bounds['version']=manifest['files'][clip['path']]['sha256'][:16]
        if bounds!=runtime[key]:raise ValueError(f'Runtime mismatch: {key}')
    for relative,meta in manifest['files'].items():
        path=inside(WORK/'clear-slow'/Path(relative).relative_to('slow'),WORK/'clear-slow')
        if path.stat().st_size!=meta['bytes'] or digest(path)!=meta['sha256']:raise ValueError('Slow stage file mismatch')
    rows=list(map(json.loads,(REPORT/'after-normal.jsonl').read_text(encoding='utf8').splitlines()))
    if len(rows)!=normal['recordings']:raise ValueError('Normal count mismatch')
    copies=[]
    for row in rows:
        path=inside(WORK/'normal'/row['path'],WORK/'normal')
        if digest(path)!=row['fileSha256']:raise ValueError('Normal stage hash mismatch')
        if row['changed']:copies.append(('public/audio/'+row['path'],path))
    completion=read(REPORT/'reading-completion.json')
    retired=set(completion['retired'])
    copies=[(relative,path) for relative,path in copies if relative.removeprefix('public/audio/') not in retired]
    for entry in completion['added']:
        path=inside(WORK/'normal'/entry['path'],WORK/'normal')
        if digest(path)!=entry['fileSha256']:raise ValueError('New reading recording hash mismatch')
        copies.append(('public/audio/'+entry['path'],path))
    for relative in ['neural-manifest.json','daily/neural-manifest.json','reading/neural-manifest.json','foundation/neural-manifest.json']:
        copies.append(('public/audio/'+relative,WORK/'normal'/relative))
    # Validate every active original, including unchanged and human recordings.
    for relative,meta in baseline.items():
        if not relative.startswith('public/audio/'):continue
        if digest(inside(ROOT/relative,ROOT/'public/audio'))!=meta['sha256']:raise ValueError(f'Audio changed since baseline: {relative}')
    live=inside(ROOT/'public/audio/slow',ROOT/'public/audio')
    archive=inside(WORK/'previous-slow',WORK)
    if archive.exists():raise ValueError('A prior apply/rollback archive exists; inspect its journal before repeating')
    print(json.dumps({'normalFilesToReplace':len(copies)-4,'slowClips':len(runtime),'slowPacks':len(manifest['files']),'apply':args.apply}),flush=True)
    if not args.apply:return
    journal=REPORT/'installation.json';attempt=str(time.time_ns())
    if journal.exists():shutil.copy2(journal,REPORT/f'installation-before-{attempt}.json')
    state={'status':'applying','normalFiles':len(copies)-4,'slowClips':len(runtime),'archive':str(archive),'replaced':[]}
    journal.write_text(json.dumps(state,indent=2),encoding='utf8')
    runtime_path=ROOT/'src/slowReadingClips.json';original_runtime=runtime_path.read_bytes()
    moved=[];installed=[]
    try:
        for relative,source in copies:
            atomic_copy(source,inside(ROOT/relative,ROOT/'public/audio'));state['replaced'].append(relative)
        for relative in retired:
            target=inside(ROOT/'public/audio'/relative,ROOT/'public/audio');saved=inside(WORK/'previous-reading'/relative,WORK)
            saved.parent.mkdir(parents=True,exist_ok=True);target.rename(saved)
        archive.mkdir(parents=True)
        # Vite can hold a Windows directory watcher open. Move individual files,
        # keeping the watched directory itself and every original for rollback.
        for path in list(live.rglob('*')):
            if not path.is_file():continue
            relative=path.relative_to(live);saved=inside(archive/relative,archive)
            saved.parent.mkdir(parents=True,exist_ok=True);path.rename(saved);moved.append(relative)
        for relative in manifest['files']:
            suffix=Path(relative).relative_to('slow');atomic_copy(WORK/'clear-slow'/suffix,live/suffix);installed.append(suffix)
        atomic_copy(WORK/'clear-slow/manifest.json',live/'manifest.json')
        installed.append(Path('manifest.json'))
        atomic_copy(WORK/'clear-slow/runtime.json',runtime_path)
        atomic_copy(WORK/'clear-slow/normal-runtime.json',ROOT/'src/contextualAudioClips.json')
        state['status']='applied'
    except Exception:
        for relative in state['replaced']:
            saved=WORK/'baseline'/relative
            if saved.exists():atomic_copy(saved,ROOT/relative)
            else:
                target=inside(ROOT/relative,ROOT/'public/audio');failed=inside(WORK/f'failed-new-reading-{attempt}'/relative,WORK)
                failed.parent.mkdir(parents=True,exist_ok=True);target.rename(failed)
        for relative in retired:
            saved=inside(WORK/'previous-reading'/relative,WORK)
            if saved.exists():saved.rename(inside(ROOT/'public/audio'/relative,ROOT/'public/audio'))
        for relative in installed:
            failed=inside(WORK/f'failed-slow-install-{attempt}'/relative,WORK)
            failed.parent.mkdir(parents=True,exist_ok=True);(live/relative).rename(failed)
        for relative in moved:
            (live/relative).parent.mkdir(parents=True,exist_ok=True);(archive/relative).rename(live/relative)
        runtime_path.write_bytes(original_runtime);state['status']='rolled-back';raise
    finally:journal.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'status':state['status']}),flush=True)

if __name__=='__main__':sys.stdout.reconfigure(encoding='utf8');main()
