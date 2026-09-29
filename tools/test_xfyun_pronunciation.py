"""Offline protocol and evidence-boundary tests; no service calls or credentials."""
import base64
import datetime
import hashlib
import hmac
import json
import contextlib
import io
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import evaluate_xfyun_pronunciation as trial


class XfyunTrialTests(unittest.TestCase):
    def test_authentication_binds_host_path_date_and_uses_local_secret(self):
        config = {'app_id': 'test-app', 'api_key': 'test-key', 'api_secret': 'test-secret'}
        now = datetime.datetime(2026, 9, 24, 0, 0, tzinfo=datetime.timezone.utc)
        url = urlparse(trial.signed_url(config, now))
        query = parse_qs(url.query)
        self.assertEqual((url.scheme, url.netloc, url.path), ('wss', trial.HOST, trial.PATH))
        self.assertEqual(query['date'], ['Thu, 24 Sep 2026 00:00:00 GMT'])
        decoded = base64.b64decode(query['authorization'][0]).decode()
        canonical = f'host: {trial.HOST}\ndate: {query["date"][0]}\nGET {trial.PATH} HTTP/1.1'
        signature = base64.b64encode(hmac.new(b'test-secret', canonical.encode(), hashlib.sha256).digest()).decode()
        self.assertIn(f'signature="{signature}"', decoded)
        self.assertNotIn('test-secret', trial.signed_url(config, now))

    def test_audio_stream_preserves_pcm_and_has_distinct_terminal_frame(self):
        pcm = bytes(range(256)) * 126
        frames = list(trial.messages('test-app', 'Goodbye.', pcm))
        first = frames[0]
        self.assertEqual(first['business']['text'], '\ufeff[word]\nGoodbye')
        self.assertEqual(first['business']['ent'], 'en_vip')
        self.assertEqual(first['business']['rst'], 'entirety')
        self.assertEqual(first['business']['aue'], 'raw')
        self.assertEqual(first['data']['status'], 0)
        self.assertEqual(frames[1]['business']['aus'], 1)
        self.assertTrue(all(frame['business']['aus'] == 2 for frame in frames[2:-1]))
        self.assertEqual(frames[-1]['business']['aus'], 4)
        self.assertEqual(frames[-1]['data'], {'status': 2, 'data': ''})
        self.assertEqual(b''.join(base64.b64decode(frame['data']['data']) for frame in frames[1:-1]), pcm)
        self.assertTrue(all(len(base64.b64decode(frame['data']['data'])) <= 1280 for frame in frames[1:-1]))

    def test_input_bounds_fail_before_network(self):
        for pcm in (b'', b'\0'*7999, b'\0'*8001, b'\0'*(trial.MAX_AUDIO_BYTES+2)):
            with self.assertRaises(trial.TrialError):
                list(trial.messages('test-app', 'Hello', pcm))
        for text in ('', 'Hello there', '[word]\nGoodbye', '你好'):
            with self.assertRaises(trial.TrialError):
                list(trial.messages('test-app', text, b'\0'*16000))

    def test_aligned_labels_are_never_treated_as_recognized_speech_or_automatic_pass(self):
        xml = '''<xml><read_word total_score="99" is_rejected="false"><sentence><word content="think" total_score="99"><syll content="th ih ng k" syll_score="99"><phone content="th" dp_message="128"/><phone content="ih" dp_message="0"/></syll></word></sentence></read_word></xml>'''
        result = trial.parse_result(base64.b64encode(xml.encode()).decode())
        self.assertEqual(result['phonemeCount'], 2)
        self.assertFalse(result['pronunciationAccepted'])
        self.assertNotIn('transcript', result)
        self.assertNotIn('heard', result)
        self.assertEqual(result['nodes'][-2]['dp_message'], '128')

    def test_partial_summary_silence_only_and_xml_entities_are_not_valid_assessments(self):
        for xml in ('<FinalResult><total_score value="100"/></FinalResult>',
                    '<xml><phone content="sil" dp_message="0"/></xml>',
                    '<!DOCTYPE foo [<!ENTITY x "hello">]><xml>&x;</xml>', '<broken>'):
            with self.assertRaises(trial.TrialError):
                trial.parse_result(base64.b64encode(xml.encode()).decode())
        for bad in (None, '!', 'a'*1400001):
            with self.assertRaises(trial.TrialError):
                trial.parse_result(bad)

    def test_public_fixtures_preserve_original_hashes_and_negative_cases(self):
        cases = trial.public_cases()
        self.assertEqual(len(cases), 10)
        self.assertIn('sink-for-think', [case['id'] for case in cases])
        self.assertIn('sheep-for-ship', [case['id'] for case in cases])
        self.assertIn('free-for-three', [case['id'] for case in cases])

    def test_missing_free_quota_confirmation_does_not_connect(self):
        with patch.object(sys, 'argv', ['trial', '--run']), \
             patch.object(trial, 'decode_pcm', return_value=b'\0'*16000), \
             patch.object(trial, 'assess') as assess:
            with self.assertRaisesRegex(trial.TrialError, 'free quota'):
                trial.main()
            assess.assert_not_called()

    def test_suntone_authentication_signs_its_own_endpoint(self):
        config = {'app_id': 'test-app', 'api_key': 'test-key', 'api_secret': 'test-secret'}
        now = datetime.datetime(2026, 9, 24, 0, 0, tzinfo=datetime.timezone.utc)
        url = urlparse(trial.signed_url(config, now, host=trial.SUNTONE_HOST, path=trial.SUNTONE_PATH))
        query = parse_qs(url.query)
        self.assertEqual((url.netloc, url.path), (trial.SUNTONE_HOST, trial.SUNTONE_PATH))
        canonical = f'host: {trial.SUNTONE_HOST}\ndate: {query["date"][0]}\nGET {trial.SUNTONE_PATH} HTTP/1.1'
        expected = base64.b64encode(hmac.new(b'test-secret', canonical.encode(), hashlib.sha256).digest()).decode()
        self.assertIn(f'signature="{expected}"', base64.b64decode(query['authorization'][0]).decode())

    def test_suntone_audio_is_lossless_across_frames_and_dialect_is_unrestricted(self):
        mp3 = bytes(range(256))*20
        frames = list(trial.suntone_messages('test-app', 'Goodbye.', mp3))
        self.assertEqual([frame['header']['status'] for frame in frames], [0]+[1]*(len(frames)-2)+[2])
        self.assertEqual([frame['payload']['data']['seq'] for frame in frames], list(range(len(frames))))
        self.assertEqual(b''.join(base64.b64decode(frame['payload']['data']['audio']) for frame in frames), mp3)
        for frame in frames:
            self.assertEqual(frame['header']['status'], frame['payload']['data']['status'])
            options = frame['parameter']['st']
            self.assertEqual(options['refText'], 'Goodbye')
            self.assertEqual(options['phoneme_output'], 1)
            self.assertEqual(options['attachAudioUrl'], 0)
            self.assertNotIn('dict_dialect', options)
            self.assertNotIn('customized_lexicon', options)
            self.assertNotIn('customized_pron', options)

    def test_suntone_scores_keep_uncertainty_and_drop_ids_and_audio_links(self):
        payload = {'eof': 1, 'refText': 'think', 'tokenId': 'private-token', 'applicationId': 'private-app',
                   'recordId': 'private-record', 'audioUrl': 'https://private.invalid/audio',
                   'result': {'overall': 98, 'pronunciation': 99, 'words': [{'word': 'think', 'readType': 0,
                       'scores': {'pronunciation': 99}, 'phonemes': [{'phoneme': 'TH', 'phone': 'th',
                           'pronunciation': 32, 'span': {'start': 0, 'end': 5}}]}],
                       'warning': [{'code': 1004, 'message': 'private-metadata'}]}}
        result = trial.parse_suntone_result(base64.b64encode(json.dumps(payload).encode()).decode(), 'Think.')
        self.assertEqual(result['phonemeCount'], 1)
        self.assertEqual(result['words'][0]['phonemes'][0]['expectedPhoneme'], 'TH')
        self.assertEqual(result['words'][0]['phonemes'][0]['pronunciation'], 32)
        self.assertEqual(result['warningCodes'], [1004])
        self.assertFalse(result['pronunciationAccepted'])
        self.assertNotIn('private-', json.dumps(result))
        self.assertNotIn('heardPhoneme', json.dumps(result))

    def test_suntone_incomplete_mismatch_and_scoreless_results_fail_closed(self):
        for payload in ({'eof': 0, 'refText': 'think'},
                        {'eof': 1, 'refText': 'ship', 'result': {'words': []}},
                        {'eof': 1, 'refText': 'think', 'result': {'overall': 100, 'words': []}},
                        {'eof': 1, 'refText': 'think', 'result': {'words': [{'phonemes': [{'phoneme': 'TH'}]}]}},
                        {'eof': 1, 'refText': 'think', 'result': {'words': [{'phonemes': None}]}}, []):
            with self.assertRaises(trial.TrialError):
                trial.parse_suntone_result(base64.b64encode(json.dumps(payload).encode()).decode(), 'think')
        for value in (None, '!', 'a'*1400001):
            with self.assertRaises(trial.TrialError):
                trial.parse_suntone_result(value, 'think')

    def test_suntone_missing_free_quota_does_not_connect(self):
        with patch.object(sys, 'argv', ['trial', '--provider', 'suntone', '--run']), \
             patch.object(trial, 'decode_pcm', return_value=b'\0'*16000), \
             patch.object(trial, 'encode_suntone_audio', return_value=b'\0'*2000), \
             patch.object(trial, 'assess_suntone') as assess:
            with self.assertRaisesRegex(trial.TrialError, 'free quota'):
                trial.main()
            assess.assert_not_called()

    def test_trial_stops_after_first_error_and_records_attempt_without_secret(self):
        # Isolated dummy credentials and files; never reads the real local config.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = root / 'test-config.json'
            config.write_text(json.dumps({'app_id': 'test', 'api_key': 'test', 'api_secret': 'test'}))
            with patch.object(sys, 'argv', ['trial', '--provider', 'suntone', '--run', '--free-quota-confirmed', '--limit', '3']), \
                 patch.object(trial, 'ROOT', root), patch.object(trial, 'CONFIG', config), \
                 patch.object(trial, 'public_cases', return_value=[{'id': f'test-{i}', 'file': 'public-fixture.mp3',
                     'sha256': 'public-hash', 'reference': 'Hello'} for i in range(10)]), \
                 patch.object(trial, 'decode_pcm', return_value=b'\0'*16000), \
                 patch.object(trial, 'encode_suntone_audio', return_value=b'\0'*2000), \
                 patch.object(trial, 'assess_suntone', side_effect=RuntimeError('private-signed-url')) as assess, \
                 contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(trial.main(), 1)
                self.assertEqual(assess.call_count, 1)
            reports = list(root.glob('.runtime/pronunciation/xfyun/*.json'))
            self.assertEqual(len(reports), 1)
            report = json.loads(reports[0].read_text())
            self.assertEqual(report['attemptedCalls'], 1)
            self.assertEqual(report['status'], 'stopped-on-error')
            self.assertEqual(report['cases'][0]['error'], 'RuntimeError')
            self.assertNotIn('private-signed-url', reports[0].read_text()+output.getvalue())


if __name__ == '__main__':
    unittest.main()
