"""Offline transport, quota-gate and report checks; never contact Azure."""
import base64
import contextlib
import io
import json
import unittest
from unittest.mock import patch

import evaluate_azure_pronunciation as trial


class Clock:
    def __init__(self): self.now=0.0
    def monotonic(self): return self.now
    def sleep(self,seconds): self.now+=seconds


class Connection:
    def __init__(self,clock,status=200):
        self.clock=clock; self.status=status; self.headers={}; self.chunks=[]; self.closed=False
    def putrequest(self,*args): self.request=args
    def putheader(self,name,value): self.headers[name]=value
    def endheaders(self): self.clock.now+=0.5
    def send(self,data): self.chunks.append((self.clock.now,data))
    def getresponse(self): self.clock.now+=0.7; return self
    def read(self,limit): return b'{"RecognitionStatus":"Success","NBest":[]}'
    def close(self): self.closed=True


class TrialTests(unittest.TestCase):
    def test_public_fixture_inventory(self):
        cases=trial.fixtures()
        self.assertEqual(sum(c['expectedCorrect'] for c in cases),14)
        self.assertEqual(len(cases),24)

    def test_stream_framing_pacing_and_elapsed_time(self):
        clock=Clock(); conn=Connection(clock); pcm=b'\x01\x02'*16000
        with patch.object(trial,'DirectHTTPS',return_value=conn), patch.object(trial,'time',clock):
            result=trial.assess({'region':'eastasia','key':'test-secret'},'hello',pcm,9)
        self.assertTrue(conn.closed)
        self.assertEqual(result['timing'],dict(audioMs=1000,connectionSetupMs=500,afterRecordingMs=700,totalMs=2200))
        self.assertEqual(conn.headers['Transfer-Encoding'],'chunked')
        self.assertEqual(conn.headers['Expect'],'100-continue')
        self.assertNotIn('Content-Length',conn.headers)
        settings=json.loads(base64.b64decode(conn.headers['Pronunciation-Assessment']))
        self.assertFalse(settings['EnableProsodyAssessment'])
        self.assertEqual(settings['Granularity'],'Phoneme')
        self.assertEqual(conn.chunks[-1][1],b'0\r\n\r\n')
        chunks=[]
        for _,frame in conn.chunks[:-1]:
            size,rest=frame.split(b'\r\n',1)
            self.assertEqual(len(rest)-2,int(size,16))
            self.assertTrue(rest.endswith(b'\r\n'))
            chunks.append(rest[:-2])
        self.assertEqual(b''.join(chunks),trial.wav_bytes(pcm))
        self.assertAlmostEqual(conn.chunks[1][0],0.7)

    def test_http_failure_closes_connection_without_retry(self):
        clock=Clock(); conn=Connection(clock,429)
        with patch.object(trial,'DirectHTTPS',return_value=conn) as factory, patch.object(trial,'time',clock):
            with self.assertRaisesRegex(trial.TrialError,'HTTP 429'):
                trial.assess({'region':'eastasia','key':'test-secret'},'hello',b'\x00'*8000,9)
        self.assertEqual(factory.call_count,1)
        self.assertTrue(conn.closed)

    def test_no_run_does_not_read_credentials_or_call_cloud(self):
        with patch('sys.argv',['trial','--limit','1']), patch.object(trial,'fixtures',return_value=[{}]*24), \
                patch.object(trial,'pcm_audio',return_value=b'\x00'*8000), \
                patch.object(trial,'read_config') as credentials, patch.object(trial,'assess') as cloud, \
                contextlib.redirect_stdout(io.StringIO()):
            trial.main()
        credentials.assert_not_called(); cloud.assert_not_called()

    def test_run_requires_explicit_f0_verification(self):
        with patch('sys.argv',['trial','--run','--limit','1']), patch.object(trial,'fixtures',return_value=[{}]*24), \
                patch.object(trial,'pcm_audio',return_value=b'\x00'*8000), \
                patch.object(trial,'read_config') as credentials, patch.object(trial,'assess') as cloud:
            with self.assertRaisesRegex(trial.TrialError,'verify the actual resource'):
                trial.main()
        credentials.assert_not_called(); cloud.assert_not_called()

    def test_report_excludes_unrelated_response_data(self):
        result=trial.safe_result({'RecognitionStatus':'Success','Id':'private-id','AudioUrl':'private-url',
            'NBest':[{'Confidence':1,'Words':[{'Word':'hello','PronunciationAssessment':{'AccuracyScore':90},
                'Phonemes':[{'Phoneme':'h','PronunciationAssessment':{'AccuracyScore':80},'Private':'private-value'}]}]}]})
        self.assertNotIn('private-',json.dumps(result))
        self.assertEqual(result['words'][0]['phonemes'],[{'target':'h','accuracy':80}])
        self.assertTrue(result['targetAlignedLabelsNotIndependentTranscript'])


if __name__=='__main__': unittest.main()
