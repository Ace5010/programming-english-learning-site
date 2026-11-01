"""Compare flagged new clips with the original browser-speed equivalent."""
import array
import json
from pathlib import Path
import subprocess
import sys
from shared_q8 import SharedQ8
from validate_clear_audio import normalize

sys.stdout.reconfigure(encoding='utf8')
root=Path(__file__).resolve().parents[1]
work=root/'.runtime/audio-optimization-20261031'
report=root/'artifacts/audio-optimization-20261031'
old=json.loads((work/'baseline/src/slowReadingClips.json').read_text(encoding='utf8'))
rows=list(map(json.loads,(report/'slow-asr.jsonl').read_text(encoding='utf8').splitlines()))
latest=rows[-1]['manifestSha256']
jobs=[x for x in rows if x['manifestSha256']==latest and not any(x.get(k) for k in ['textMatch','homophoneMatch','spellingVariant']) and not x['key'].startswith('normal:')]
model=SharedQ8();out=[]
try:
    for item in jobs:
        voice,key=item['key'].split(':',1);start=None;end=None
        if key.startswith('tutorial@'):
            path=work/'baseline/public/audio/foundation'/voice/(key.split('@',1)[1]+'.mp3')
        elif item['key'] in old:
            clip=old[item['key']];path=work/'baseline/public/audio'/clip['path'];start=clip['startMs']/1000;end=clip['endMs']/1000
        else:continue
        command=['ffmpeg','-v','error','-i',str(path)]
        if start is not None:command+=['-ss',str(start),'-t',str(end-start)]
        command+=['-af','atempo=0.72','-ar','16000','-ac','1','-f','f32le','-']
        result=subprocess.run(command,capture_output=True,check=True,timeout=30)
        pcm=array.array('f');pcm.frombytes(result.stdout)
        text=model(pcm)['transcript'];row={**item,'beforeTranscript':text,'beforeTextMatch':normalize(text)==normalize(item['expected'])};out.append(row)
        if row['beforeTextMatch']:print(item['key'],item['expected'],'new=',item['transcript'],'old=',text,flush=True)
finally:model.close()
(report/'slow-asr-comparison.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print('compared',len(out),'possible regressions',sum(x['beforeTextMatch'] for x in out))
