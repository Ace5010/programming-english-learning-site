"""Loopback-only experimental recorder. Audio stays in memory; no course writes."""
import argparse
import base64
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
import time

from local_pronunciation import LocalAssessment, AssessmentInputError, ROOT, VERSION

TRIAL_WORDS = {
    'Hello': ('你好', 'public/audio/daily/aria/hello.mp3'),
    'Goodbye': ('再见', 'public/audio/daily/aria/goodbye.mp3'),
    'Three': ('三', 'public/audio/aria/word-2400.mp3'),
    'Yes': ('是', 'public/audio/aria/word-2562.mp3'),
    'No': ('不', 'public/audio/aria/word-1956.mp3'),
    'Think': ('想；认为', 'public/audio/aria/word-2652.mp3'),
    'Sink': ('下沉；水槽', 'public/audio/aria/word-959.mp3'),
    'Ship': ('船', 'public/audio/aria/word-2224.mp3'),
    'Sheep': ('绵羊', 'public/audio/aria/word-2968.mp3'),
    'Tree': ('树', 'public/audio/aria/word-2441.mp3'),
    'Free': ('自由的；免费的', 'public/audio/aria/word-1649.mp3'),
    'Bad': ('坏的', 'public/audio/aria/word-2978.mp3'),
    'Bed': ('床', 'public/audio/aria/word-1291.mp3'),
    'Right': ('正确的；右边', 'public/audio/aria/word-2160.mp3'),
    'Light': ('光；灯', 'public/audio/aria/word-1852.mp3'),
}

COURSE_ORIGINS = frozenset({
    'http://localhost:5186', 'http://127.0.0.1:5186',
    'https://programming-english-learning-site.pages.dev',
    'https://ace5010.github.io',
})


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18765)
    parser.add_argument('--engine',choices=['openpronounce','crottc','sensevoice'],default='openpronounce');args=parser.parse_args()
    origin=f'http://127.0.0.1:{args.port}'
    token=secrets.token_urlsafe(32)
    lock=threading.Lock()
    activity={'since':None}
    engine_class, engine_version = LocalAssessment, VERSION
    if args.engine == 'crottc':
        from crottc_pronunciation import CrottcAssessment, VERSION as CROTTC_VERSION
        engine_class, engine_version = CrottcAssessment, CROTTC_VERSION
    elif args.engine == 'sensevoice':
        from sensevoice_recognition import SenseVoiceRecognition, VERSION as SENSEVOICE_VERSION
        engine_class, engine_version = SenseVoiceRecognition, SENSEVOICE_VERSION
    engine=engine_class()
    if args.engine!='sensevoice':
        engine.assess((ROOT/'public/audio/daily/aria/goodbye.mp3').read_bytes(),'Goodbye')
    for _, file in TRIAL_WORDS.values():
        if not (ROOT/file).is_file():
            raise FileNotFoundError(file)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup();self.connection.settimeout(12)

        def log_message(self,*args):
            pass

        def reply(self,status,body,kind='application/json; charset=utf-8'):
            data=body if isinstance(body,bytes) else body.encode('utf-8') if isinstance(body,str) else json.dumps(body,ensure_ascii=False,allow_nan=False).encode('utf-8')
            self.send_response(status)
            for key,value in {'Content-Type':kind,'Content-Length':str(len(data)),'Cache-Control':'no-store',
                'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
                'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'"}.items():self.send_header(key,value)
            if self.path in ('/api/course-session', '/api/course-transcribe') and self.headers.get('Origin') in COURSE_ORIGINS:
                self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
                self.send_header('Vary','Origin')
                self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers','Content-Type, X-Local-Token')
                self.send_header('Access-Control-Allow-Private-Network','true')
            try:self.end_headers();self.wfile.write(data)
            except (BrokenPipeError,ConnectionError):pass

        def do_GET(self):
            if self.headers.get('Host')!=f'127.0.0.1:{args.port}':return self.reply(403,{'error':'host'})
            if self.path=='/health':return self.reply(200,{'ready':True,'engine':engine_version,'localOnly':True,
                'busy':lock.locked(),'experimental':True,'rawAudioSaved':False,
                'processingSeconds':round(time.monotonic()-activity['since'],1) if activity['since'] else 0})
            if self.path=='/api/course-session' and args.engine=='sensevoice':
                if self.headers.get('Origin') not in COURSE_ORIGINS:return self.reply(403,{'error':'origin'})
                return self.reply(200,{'ready':True,'engine':engine_version,'token':token,'rawAudioSaved':False})
            if self.path.startswith('/audio/'):
                word=self.path.removeprefix('/audio/').removesuffix('.mp3')
                if self.path!=f'/audio/{word}.mp3' or word not in TRIAL_WORDS:
                    return self.reply(404,{'error':'not-found'})
                return self.reply(200,(ROOT/TRIAL_WORDS[word][1]).read_bytes(),'audio/mpeg')
            if self.path!='/':return self.reply(404,{'error':'not-found'})
            page=Path(__file__).with_name('pronunciation_lab.html').read_text(encoding='utf-8').replace('__TOKEN__',token)
            page=page.replace('__SCOPE_NOTE__',
                '只显示识别出的单词，不判断发音是否合格，也不指出错音。' if args.engine=='sensevoice'
                else '当前只测试单词；整句评测尚未通过验证。' if args.engine=='crottc' else '')
            page=page.replace('__ENGINE__',engine_version)
            page=page.replace('__PAGE_TITLE__','本机单词试读' if args.engine=='sensevoice' else '本机发音验证')
            page=page.replace('__PRIVACY_NOTE__',
                '录音只在这台电脑处理，不保存，不调用云端；结果不计入课程。' if args.engine=='sensevoice'
                else '声音只在这台电脑处理，不调用云端，不保存录音。这是接入课程前的测试，结果不会改动学习进度。')
            page=page.replace('__WORD_DATA__',json.dumps({word:{'meaning':meaning,'audio':f'/audio/{word}.mp3'}
                for word,(meaning,_) in TRIAL_WORDS.items()},ensure_ascii=False))
            self.reply(200,page,'text/html; charset=utf-8')

        def do_POST(self):
            if self.path not in ('/api/assess','/api/course-transcribe'):return self.reply(404,{'error':'not-found'})
            course=self.path=='/api/course-transcribe'
            if course and args.engine!='sensevoice':return self.reply(404,{'error':'not-found'})
            allowed=self.headers.get('Origin') in COURSE_ORIGINS if course else self.headers.get('Origin')==origin
            if self.headers.get('Host')!=f'127.0.0.1:{args.port}' or not allowed or not hmac.compare_digest(self.headers.get('X-Local-Token',''),token):
                return self.reply(403,{'error':'request-not-authorized'})
            try:length=int(self.headers.get('Content-Length','0'))
            except ValueError:return self.reply(400,{'error':'invalid-length'})
            if not 1<=length<=2_100_000:return self.reply(413,{'error':'audio-too-large'})
            if not lock.acquire(blocking=False):return self.reply(409,{'error':'busy'})
            activity['since']=time.monotonic()
            try:
                request=json.loads(self.rfile.read(length))
                if not isinstance(request,dict) or not isinstance(request.get('audio'),str):raise AssessmentInputError('invalid-audio')
                audio=base64.b64decode(request['audio'],validate=True)
                self.reply(200,engine.transcribe(audio) if course else engine.assess(audio,request.get('reference')))
            except AssessmentInputError as exc:self.reply(422,{'error':exc.code})
            except Exception:self.reply(422,{'error':'unable-to-assess'})
            finally:activity['since']=None;lock.release()

        def do_OPTIONS(self):
            if self.path not in ('/api/course-session','/api/course-transcribe') or args.engine!='sensevoice':return self.reply(404,{'error':'not-found'})
            if self.headers.get('Host')!=f'127.0.0.1:{args.port}' or self.headers.get('Origin') not in COURSE_ORIGINS:
                return self.reply(403,{'error':'origin'})
            self.reply(204,b'')

    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(json.dumps({'ready':True,'engine':engine_version,'origin':origin,'cloudCalls':0,'rawAudioSaved':False}),flush=True)
    server.serve_forever()

if __name__=='__main__':main()
