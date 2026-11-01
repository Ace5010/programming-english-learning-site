"""Stage missing current-course recordings discovered by the inventory regression."""
import asyncio
import json
from pathlib import Path
import shutil
import subprocess
import sys
import edge_tts
from generate_clear_slow_audio import decode,normalized_clip,sha,VOICES
from optimize_normal_audio import encode
from verify_daily_audio import inspect_audio,synthesis_hash

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.runtime/audio-optimization-20261031'

async def main():
    source=ROOT/'src/readingAudio.json'
    fresh=json.loads(subprocess.run(['node','scripts/reading-audio-inventory.mjs'],cwd=ROOT,capture_output=True,encoding='utf8',check=True).stdout)
    saved=WORK/'baseline/src/readingAudio.json'
    if not saved.exists():shutil.copy2(source,saved)
    old=json.loads(saved.read_text(encoding='utf8'));old_ids={e['id']for e in old};new_ids={e['id']for e in fresh}
    folder=WORK/'normal/reading';manifest_path=folder/'neural-manifest.json';manifest=json.loads(manifest_path.read_text(encoding='utf8'))
    added=[];retired=[]
    for voice,name in VOICES.items():
        for entry in fresh:
            if entry['id'] in old_ids:continue
            relative=f'{voice}/{entry["id"]}.mp3';target=folder/relative
            if relative not in manifest['entries']:
                raw=WORK/f'{voice}-{entry["id"]}.mp3'
                if not raw.exists():await edge_tts.Communicate(entry['text'],name,rate='+0%',connect_timeout=30,receive_timeout=90).save(str(raw))
                pcm,analysis=normalized_clip(decode(raw));encode(pcm,target)
                manifest['entries'][relative]={**inspect_audio(target),'id':entry['id'],'text':entry['text'],'voice':name,'rate':'+0%','synthesisSha256':synthesis_hash(name,entry['text']),'optimization':{'profile':'clear-normal-v1','newRecording':True,**analysis}}
            added.append({'path':'reading/'+relative,'text':entry['text'],'fileSha256':sha(target.read_bytes())})
        for entry in old:
            if entry['id'] in new_ids:continue
            relative=f'{voice}/{entry["id"]}.mp3';manifest['entries'].pop(relative,None);retired.append('reading/'+relative)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    source.write_text(json.dumps(fresh,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    report={'added':added,'retired':retired,'readingTexts':len(fresh),'normalRecordings':16400+len(added)-len(retired),'originalInventorySha256':sha(saved.read_bytes())}
    (ROOT/'artifacts/audio-optimization-20261031/reading-completion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':sys.stdout.reconfigure(encoding='utf8');asyncio.run(main())
