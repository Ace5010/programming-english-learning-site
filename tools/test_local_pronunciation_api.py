"""Real local API checks; only public fixtures are sent to loopback."""
import base64
import json
import os
from pathlib import Path
import re
import unittest
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
ORIGIN=os.environ.get('CODEWORDS_LAB_ORIGIN','http://127.0.0.1:18765')
ENGINE=os.environ.get('CODEWORDS_LAB_ENGINE','openpronounce-feedback-v2')


class LocalApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with urllib.request.urlopen(ORIGIN+'/') as response:html=response.read().decode('utf-8')
        cls.token=re.search("const token='([^']+)'",html).group(1)

    def post(self, data, **headers):
        request=urllib.request.Request(ORIGIN+'/api/assess',json.dumps(data).encode(),headers={
            'Content-Type':'application/json','Origin':ORIGIN,'X-Local-Token':self.token,**headers})
        try:
            with urllib.request.urlopen(request,timeout=10) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as exc:return exc.code,json.load(exc)

    def audio(self,path):return base64.b64encode((ROOT/path).read_bytes()).decode()

    def test_identity(self):
        with urllib.request.urlopen(ORIGIN+'/health') as response:data=json.load(response)
        self.assertEqual(data['engine'],ENGINE)
        self.assertFalse(data['rawAudioSaved']);self.assertTrue(data['localOnly'])

    def test_goodbye(self):
        status,r=self.post({'audio':self.audio('public/audio/daily/aria/goodbye.mp3'),'reference':'Goodbye'})
        self.assertEqual(status,200);self.assertEqual(r['status'],'supported');self.assertEqual(r['feedback'],[])

    def test_wrong_vowel(self):
        status,r=self.post({'audio':self.audio('public/audio/aria/word-2968.mp3'),'reference':'ship'})
        self.assertEqual(status,200);self.assertEqual(r['status'],'practice')
        self.assertTrue(any(f['expected']=='ɪ' and f['heard']=='i' for f in r['feedback']))

    def test_numeric_three(self):
        if ENGINE == 'crottc-whisper-word-v2':
            status,r=self.post({'audio':self.audio('public/audio/guy/word-2400.mp3'),'reference':'Three'})
            self.assertEqual(status,200);self.assertEqual(r['status'],'supported')
            self.assertEqual(r['transcript'],'three');self.assertEqual(r['feedback'],[])

    def test_host_origin_and_token(self):
        for headers in [{'Origin':'https://example.com'},{'Host':'example.com'},{'X-Local-Token':'wrong'}]:
            self.assertEqual(self.post({},**headers)[0],403)

    def test_invalid_audio(self):
        self.assertEqual(self.post({'audio':'YWJj','reference':'hello'})[0],422)
        self.assertEqual(self.post({'audio':'###','reference':'hello'})[0],422)

    def test_bad_reference(self):
        self.assertEqual(self.post({'audio':self.audio('public/audio/daily/aria/hello.mp3'),'reference':None})[1]['error'],'invalid-reference')

    def test_regression_acceptance_gate(self):
        if ENGINE.startswith('crottc-whisper-word-'):
            report=json.loads((ROOT/'artifacts/course-upgrade/pre-push/pronunciation/crottc-feedback-evaluation.json').read_text(encoding='utf-8'))
            # Preserve the failed sentence evaluation; only the word screen is eligible here.
            self.assertEqual(report['version'],'crottc-whisper-feedback-v1')
            self.assertEqual(report['summary']['synthetic-correct']['practice'],0)
            self.assertEqual(report['summary']['synthetic-wrong']['supported'],0)
            self.assertTrue(all(r['status']=='uncertain' for r in report['controls'].values()))
            if ENGINE == 'crottc-whisper-word-v2':
                current=json.loads((ROOT/f'artifacts/course-upgrade/pre-push/pronunciation/{ENGINE}-evaluation.json').read_text(encoding='utf-8'))
                self.assertEqual(len(current['cases']),24)
                self.assertEqual(current['summary']['synthetic-correct']['practice'],0)
                self.assertEqual(current['summary']['synthetic-wrong']['supported'],0)
                self.assertTrue(all(r['status']=='uncertain' for r in current['controls'].values()))
            return
        report=json.loads((ROOT/'artifacts/course-upgrade/pre-push/pronunciation/open-feedback-evaluation.json').read_text(encoding='utf-8'))
        self.assertEqual(report['policyVersion'],'openpronounce-feedback-v2')
        self.assertEqual(len(report['cases']),168)
        for split in report['summary'].values():
            self.assertEqual(split['normal']['practice'],0)
            self.assertEqual(split['wrong']['supported'],0)
        self.assertTrue(all(r['status']=='uncertain' for r in report['controls'].values()))

    def test_sentence_scope(self):
        if ENGINE.startswith('crottc-whisper-word-'):
            status,r=self.post({'audio':self.audio('public/audio/daily/aria/goodbye.mp3'),'reference':'Good morning'})
            self.assertEqual(status,200);self.assertEqual(r['reason'],'single-word-only')
            self.assertEqual(r['status'],'uncertain');self.assertEqual(r['feedback'],[])

if __name__=='__main__':unittest.main()
