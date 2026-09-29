"""Bounded F0 trial on public fixtures. Default: offline preflight, no credentials read.

Real-time-paced PCM upload measures end-of-recording to completed response.
No private audio, automatic retries, prosody add-on, or production grading.
"""
import argparse
import base64
import contextlib
import datetime
import hashlib
import http.client
import io
import json
import math
import pathlib
import re
import socket
import ssl
import struct
import subprocess
import time
import wave

ROOT=pathlib.Path(__file__).resolve().parents[1]
PLAN=ROOT/'artifacts/course-upgrade/pre-push/pronunciation/azure-free-test-plan.json'
CONFIG=ROOT/'.runtime/pronunciation/azure.json'

class TrialError(Exception):
    pass

def fixtures():
    cases=json.loads(PLAN.read_text(encoding='utf-8'))['cases']
    if len(cases)!=24 or len({c['id'] for c in cases})!=24:
        raise TrialError('Expected 24 distinct reviewed public fixtures')
    for case in cases:
        path=(ROOT/case['file']).resolve()
        if not path.is_relative_to((ROOT/'public/audio').resolve()) or path.suffix!='.mp3':
            raise TrialError('Only public course MP3 files are permitted')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=case['sha256']:
            raise TrialError('Fixture changed: review the plan before uploading')
        if not re.fullmatch('[A-Za-z]+',case['reference']):
            raise TrialError('This trial only accepts single-word references')
    return cases

def pcm_audio(case):
    proc=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(ROOT/case['file']),
        '-f','s16le','-ar','16000','-ac','1','pipe:1'],capture_output=True,timeout=20)
    if proc.returncode or not 8000<=len(proc.stdout)<=160000 or len(proc.stdout)%2:
        raise TrialError('Audio must decode to 0.25-5 seconds of mono PCM16')
    return proc.stdout

def wav_bytes(pcm):
    out=io.BytesIO()
    with wave.open(out,'wb') as writer:
        writer.setnchannels(1);writer.setsampwidth(2);writer.setframerate(16000);writer.writeframes(pcm)
    return out.getvalue()

def read_config():
    config=json.loads(CONFIG.read_text(encoding='utf-8'))
    if config.get('tier')!='F0' or config.get('region') not in {'eastasia','southeastasia'}:
        raise TrialError('An independently verified Asian-region F0 resource is required')
    if not re.fullmatch('[a-fA-F0-9]{32,128}',config.get('key','')):
        raise TrialError('Invalid local credential format')
    return config

def number(value):
    return float(value) if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) else None

def score(item):
    return number(item.get('PronunciationAssessment',{}).get('AccuracyScore',item.get('AccuracyScore')))

def safe_result(body):
    best=(body.get('NBest') or [{}])[0]
    return {'recognitionStatus':str(body.get('RecognitionStatus',''))[:50],
        'accuracy':score(best),'targetAlignedLabelsNotIndependentTranscript':True,
        'words':[{'word':str(word.get('Word',''))[:80],'accuracy':score(word),
            'errorType':str(word.get('PronunciationAssessment',{}).get('ErrorType',word.get('ErrorType','')))[:40],
            'phonemes':[{'target':str(p.get('Phoneme',''))[:20],'accuracy':score(p)}
                for p in word.get('Phonemes',[])[:60]]} for word in best.get('Words',[])[:20]]}

class DirectHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,interface):
        super().__init__(host,timeout=20,context=ssl.create_default_context())
        self.interface=interface
    def connect(self):
        address=socket.getaddrinfo(self.host,443,socket.AF_INET,socket.SOCK_STREAM)[0][4]
        raw=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
        try:
            raw.settimeout(self.timeout)
            raw.setsockopt(socket.IPPROTO_IP,31,struct.pack('!I',self.interface))
            raw.connect(address)
            self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
        except Exception:
            raw.close()
            raise

def assess(config,reference,pcm,interface):
    host=config['region']+'.stt.speech.microsoft.com'
    path='/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed'
    settings={'ReferenceText':reference,'GradingSystem':'HundredMark','Granularity':'Phoneme',
              'Dimension':'Comprehensive','EnableMiscue':True,'EnableProsodyAssessment':False}
    started=time.monotonic()
    with contextlib.closing(DirectHTTPS(host,interface)) as conn:
        conn.putrequest('POST',path)
        conn.putheader('Ocp-Apim-Subscription-Key',config['key'])
        conn.putheader('Pronunciation-Assessment',base64.b64encode(json.dumps(settings).encode()).decode())
        conn.putheader('Content-Type','audio/wav; codecs=audio/pcm; samplerate=16000')
        conn.putheader('Accept','application/json');conn.putheader('Transfer-Encoding','chunked')
        conn.putheader('Expect','100-continue')
        conn.endheaders()
        def chunk(data):
            conn.send(f'{len(data):X}\r\n'.encode()+data+b'\r\n')
        chunk(wav_bytes(pcm)[:44])
        audio_start=time.monotonic()
        for offset in range(0,len(pcm),6400):
            data=pcm[offset:offset+6400]
            time.sleep(max(0,audio_start+(offset+len(data))/32000-time.monotonic()))
            chunk(data)
        # Include upload backpressure in the delay after the final audio sample.
        recording_end=audio_start+len(pcm)/32000
        conn.send(b'0\r\n\r\n')
        response=conn.getresponse()
        body=response.read(1000001)
        finished=time.monotonic()
        if response.status!=200:
            raise TrialError(f'HTTP {response.status}; stopped without retry')
        if len(body)>1000000:
            raise TrialError('Response exceeded limit')
    result=safe_result(json.loads(body))
    result['timing']={'audioMs':round(len(pcm)/32),'connectionSetupMs':round((audio_start-started)*1000),
        'afterRecordingMs':round((finished-recording_end)*1000),'totalMs':round((finished-started)*1000)}
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',action='store_true')
    parser.add_argument('--free-tier-confirmed',action='store_true')
    parser.add_argument('--limit',type=int,default=3)
    parser.add_argument('--offset',type=int,default=0)
    parser.add_argument('--interface',type=int,default=9)
    args=parser.parse_args()
    cases=fixtures()
    if not 1<=args.limit<=24 or not 0<=args.offset<24 or args.offset+args.limit>24 or args.interface<1:
        raise TrialError('Invalid bounded trial range')
    decoded=[(case,pcm_audio(case)) for case in cases[args.offset:args.offset+args.limit]]
    if not args.run:
        print(json.dumps({'mode':'offline-preflight','cases':len(decoded),
            'audioSeconds':round(sum(len(pcm)/32000 for _,pcm in decoded),2),'cloudCalls':0}))
        return
    if not args.free_tier_confirmed:
        raise TrialError('First verify the actual resource is F0; no calls made')
    config=read_config()
    report={'status':'running','region':config['region'],'tier':'F0','interfaceIndex':args.interface,
        'containsUserRecording':False,'prosodyEnabled':False,'autoRetry':False,'cases':[]}
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output=PLAN.parent/f'azure-free-trial-{stamp}.json'
    for case,pcm in decoded:
        try:
            result=assess(config,case['reference'],pcm,args.interface)
            report['cases'].append({'id':case['id'],'expectedCorrect':case['expectedCorrect'],'result':result})
            print(json.dumps({'id':case['id'],'timing':result['timing'],'status':result['recognitionStatus']}),flush=True)
        except Exception as error:
            report.update(status='stopped-on-first-error',error=str(error) if isinstance(error,TrialError) else type(error).__name__)
            output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            raise TrialError(report['error']) from None
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report['status']='completed-public-fixtures-only-not-human-acceptance'
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(str(error) if isinstance(error,TrialError) else type(error).__name__)
        raise SystemExit(1)
