"""Offline protocol and guardrail tests; never calls Tencent."""
import base64
import hashlib
import hmac
import json
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

import evaluate_tencent_pronunciation as trial


class TencentTrialTests(unittest.TestCase):
    def test_signature_uses_raw_sorted_parameters_and_encoded_url(self):
        config = {'app_id': '1234567890', 'secret_id': 'exampleID', 'secret_key': 'exampleKey'}
        url = trial.signed_url(config, 'hello', now=1722321759, nonce=42, voice_id='test-voice')
        parts = urllib.parse.urlsplit(url)
        params = dict(urllib.parse.parse_qsl(parts.query))
        actual = params.pop('signature')
        raw = 'soe.cloud.tencent.com/soe/api/1234567890?' + '&'.join(
            f'{key}={params[key]}' for key in sorted(params))
        expected = base64.b64encode(hmac.new(b'exampleKey', raw.encode(), hashlib.sha1).digest()).decode()
        self.assertEqual(actual, expected)
        self.assertEqual(params['eval_mode'], '4')
        self.assertEqual(params['rec_mode'], '0')
        self.assertEqual(params['server_engine_type'], '16k_en')
        self.assertIn('%3D', parts.query)

    def test_preserves_heard_and_reference_phones_separately(self):
        result = trial.safe_result({'Words': [{'Word': 'think', 'PhoneInfos': [
            {'Phone': 's', 'ReferencePhone': 'th', 'MatchTag': 3, 'PronAccuracy': 25}]}],
            'voice_id': 'private', 'audio_url': 'https://example.invalid/private'})
        self.assertEqual(result['Words'][0]['PhoneInfos'][0]['Phone'], 's')
        self.assertEqual(result['Words'][0]['PhoneInfos'][0]['ReferencePhone'], 'th')
        self.assertNotIn('private', json.dumps(result))

    def test_does_not_guess_unstructured_vendor_output(self):
        with self.assertRaises(trial.TrialError):
            trial.safe_result('{PronAccuracy:99 Words:[]}')

    def test_rejects_unexpected_link_in_allowed_field(self):
        with self.assertRaises(trial.TrialError):
            trial.safe_result({'Words': [{'Word': 'https://example.invalid?secret=private'}]})

    def test_public_plan_hashes_and_negative_controls(self):
        cases = trial.fixtures()
        self.assertEqual(sum(c['expectedCorrect'] for c in cases), 14)
        self.assertEqual(sum(not c['expectedCorrect'] for c in cases), 10)
        self.assertTrue(any(c['spokenFixture'] == 'sink' and c['reference'] == 'think' for c in cases))

    def test_offline_mode_never_reads_credentials_or_calls_network(self):
        with patch('sys.argv', ['trial']), patch.object(trial, 'pcm_audio', return_value=b'\0' * 32000), \
             patch.object(trial, 'assess', side_effect=AssertionError('must not call')) as network, \
             patch.object(trial, 'CONFIG', Path('missing-credentials.json')):
            trial.main()
            network.assert_not_called()

    def test_run_without_spend_authorization_stops_before_network(self):
        with patch('sys.argv', ['trial', '--run']), patch.object(trial, 'pcm_audio', return_value=b'\0' * 32000), \
             patch.object(trial, 'assess') as network:
            with self.assertRaisesRegex(trial.TrialError, 'authorization'):
                trial.main()
            network.assert_not_called()

    def test_first_error_preserves_uncertain_attempt_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'config.json'
            config.write_text(json.dumps({'app_id': '1234567890', 'secret_id': 'x' * 20, 'secret_key': 'y' * 20}))
            cases = trial.fixtures()
            with patch('sys.argv', ['trial', '--run', '--quota-and-spend-confirmed', '--limit', '2']), \
                 patch.object(trial, 'CONFIG', config), patch.object(trial, 'PLAN', Path(directory) / 'plan.json'), \
                 patch.object(trial, 'fixtures', return_value=cases), \
                 patch.object(trial, 'pcm_audio', return_value=b'\0' * 32000), \
                 patch.object(trial, 'assess', side_effect=RuntimeError('https://private?secret=KEY')) as network:
                with self.assertRaises(trial.TrialError):
                    trial.main()
            self.assertEqual(network.call_count, 1)
            report = json.loads(next(Path(directory).glob('tencent-trial-*.json')).read_text())
            self.assertEqual(report['cases'][0]['status'], 'failed-or-uncertain')
            self.assertEqual(report['status'], 'stopped-on-first-error')
            self.assertNotIn('private', json.dumps(report))

    def test_previous_failed_attempts_also_consume_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            old = Path(directory) / 'tencent-trial-earlier.json'
            old.write_text(json.dumps({'cases': [{'status': 'failed-or-uncertain'}] * 23}))
            with patch.object(trial, 'PLAN', Path(directory) / 'plan.json'):
                trial.check_remaining_budget(1)
                with self.assertRaisesRegex(trial.TrialError, 'cumulative'):
                    trial.check_remaining_budget(2)

    def test_strictness_budget_cannot_be_used_for_extra_baseline_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            old = Path(directory) / 'tencent-trial-base.json'
            old.write_text(json.dumps({'scoreCoeff': 1.5, 'cases': [{}] * 24}))
            with patch.object(trial, 'PLAN', Path(directory) / 'plan.json'):
                trial.check_remaining_budget(12, 4.0)
                with self.assertRaises(trial.TrialError):
                    trial.check_remaining_budget(1, 1.5)
                with self.assertRaises(trial.TrialError):
                    trial.check_remaining_budget(13, 4.0)

    def test_strictness_plan_is_same_twelve_public_controls(self):
        cases = trial.fixtures(True)
        base = {c['id']: c for c in trial.fixtures()}
        self.assertEqual(len(cases), 12)
        self.assertEqual(sum(c['expectedCorrect'] for c in cases), 6)
        for case in cases:
            self.assertEqual(case, base[case['id']])


if __name__ == '__main__':
    unittest.main()
