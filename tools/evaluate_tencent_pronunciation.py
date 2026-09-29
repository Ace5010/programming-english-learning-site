"""Bounded Tencent SOE NEW public-fixture trial; default is offline only.

Protocol: https://cloud.tencent.com/document/product/1774/107497
No production grading, private recordings, automatic retries or frontend keys.
"""
import argparse
import base64
import datetime
import hashlib
import hmac
import json
import pathlib
import re
import secrets
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLAN = ROOT / 'artifacts/course-upgrade/pre-push/pronunciation/tencent-test-plan.json'
STRICT_PLAN = PLAN.parent / 'tencent-strictness-test-plan.json'
CONFIG = ROOT / '.runtime/pronunciation/tencent.json'
HOST = 'soe.cloud.tencent.com'


class TrialError(Exception):
    """Only locally constructed, non-sensitive messages may be printed."""


def pcm_audio(case):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i',
                             str(ROOT / case['file']), '-f', 's16le', '-ar', '16000',
                             '-ac', '1', 'pipe:1'], capture_output=True, timeout=20)
    if result.returncode or not 8000 <= len(result.stdout) <= 160000 or len(result.stdout) % 2:
        raise TrialError('Audio must decode to 0.25-5 seconds of mono PCM16')
    return result.stdout


def fixtures(strictness=False):
    plan = json.loads((STRICT_PLAN if strictness else PLAN).read_text(encoding='utf-8-sig'))
    cases = plan['cases']
    expected = 12 if strictness else 24
    if plan.get('evalMode') != 4 or len(cases) != expected or len({c['id'] for c in cases}) != expected:
        raise TrialError('Unexpected reviewed word correction plan')
    for case in cases:
        path = (ROOT / case['file']).resolve()
        if not path.is_relative_to((ROOT / 'public/audio').resolve()) or path.suffix != '.mp3':
            raise TrialError('Only public course MP3 files are permitted')
        if hashlib.sha256(path.read_bytes()).hexdigest() != case['sha256']:
            raise TrialError('Fixture changed; review before uploading')
        if not re.fullmatch('[A-Za-z]+', case['reference']):
            raise TrialError('Only single-word references are permitted')
    return cases


def signed_url(config, reference, *, score_coeff=1.5, now=None, nonce=None, voice_id=None):
    if score_coeff not in (1.5, 4.0):
        raise TrialError('Only the two reviewed strictness values are permitted')
    now = int(time.time()) if now is None else now
    params = {'secretid': config['secret_id'], 'timestamp': now, 'expired': now + 300,
              'nonce': secrets.randbelow(9999999999) + 1 if nonce is None else nonce,
              'voice_id': str(uuid.uuid4()) if voice_id is None else voice_id,
              'server_engine_type': '16k_en', 'voice_format': 0, 'text_mode': 0,
              'ref_text': reference, 'eval_mode': 4, 'score_coeff': score_coeff,
              'sentence_info_enabled': 1, 'rec_mode': 0}
    prefix = f'{HOST}/soe/api/{config["app_id"]}'
    canonical = prefix + '?' + '&'.join(f'{key}={params[key]}' for key in sorted(params))
    signature = base64.b64encode(hmac.new(config['secret_key'].encode(), canonical.encode(), hashlib.sha1).digest()).decode()
    return 'wss://' + prefix + '?' + urllib.parse.urlencode({**params, 'signature': signature})


def safe_result(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            raise TrialError('Result is not structured JSON; inspect schema before continuing') from None
    if not isinstance(value, dict):
        raise TrialError('Missing structured assessment result')
    # Explicit field whitelist excludes vendor session IDs, audio links and diagnostics.
    fields = {'SuggestedScore', 'PronAccuracy', 'PronFluency', 'PronCompletion',
              'Word', 'ReferenceWord', 'Phone', 'ReferencePhone', 'ReferenceLetter',
              'MatchTag', 'Tag', 'Stress', 'DetectedStress', 'MemBeginTime', 'MemEndTime',
              'Mbtm', 'Metm', 'Words', 'PhoneInfos', 'PhoneInfo'}
    def clean(node, depth=0):
        if depth > 8:
            raise TrialError('Unexpected assessment nesting')
        if isinstance(node, dict):
            return {k: clean(v, depth + 1) for k, v in node.items() if k in fields}
        if isinstance(node, list):
            if len(node) > 200:
                raise TrialError('Unexpected assessment length')
            return [clean(v, depth + 1) for v in node]
        if isinstance(node, str):
            if len(node) > 100 or not re.fullmatch(r"[A-Za-z0-9_ .,'\-ɑ-˿]*", node):
                raise TrialError('Unexpected text in assessment fields')
            return node
        if node is None or type(node) in (int, float, bool):
            return node
        raise TrialError('Unexpected assessment value')
    return clean(value)


def direct_socket(interface):
    if sys.platform != 'win32' or not 0 < interface < (1 << 24):
        raise TrialError('A verified physical Windows interface is required')
    raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        raw.settimeout(12)
        raw.setsockopt(socket.IPPROTO_IP, 31, struct.pack('!I', interface))
        raw.connect(socket.getaddrinfo(HOST, 443, socket.AF_INET, socket.SOCK_STREAM)[0][4])
        return raw
    except Exception:
        raw.close()
        raise


def check_remaining_budget(requested, score_coeff=1.5):
    # Includes failed/uncertain attempts and previous partial runs. Do not delete
    # reports to reset a budget; any expansion needs a new explicit authorization.
    attempted = 0
    round_attempted = 0
    for path in PLAN.parent.glob('tencent-trial-*.json'):
        report = json.loads(path.read_text(encoding='utf-8'))
        attempted += len(report['cases'])
        if report.get('scoreCoeff', 1.5) == score_coeff:
            round_attempted += len(report['cases'])
    round_cap = {1.5: 24, 4.0: 12}[score_coeff]
    if attempted + requested > 36 or round_attempted + requested > round_cap:
        raise TrialError('The cumulative authorization would be exceeded: 24 baseline + 12 strict; CNY 0.18 total')


def assess(config, reference, pcm, interface, score_coeff=1.5):
    from websockets.sync.client import connect
    started = time.monotonic()
    raw = direct_socket(interface)
    results = []
    def receive(ws, timeout):
        reply = json.loads(ws.recv(timeout=timeout))
        if reply.get('code') != 0:
            code = reply.get('code')
            raise TrialError(f'Tencent service error {code if type(code) is int else "unknown"}')
        if reply.get('result') is not None:
            results.append(safe_result(reply['result']))
        return reply.get('final') == 1
    try:
        with connect(signed_url(config, reference, score_coeff=score_coeff), sock=raw, proxy=None, open_timeout=15,
                     close_timeout=2, max_size=1000000, compression=None) as ws:
            if receive(ws, 12):
                raise TrialError('Assessment ended before audio upload')
            audio_start = time.monotonic()
            # Simulate microphone capture: a frame cannot be sent before it exists.
            for offset in range(0, len(pcm), 1280):
                chunk = pcm[offset:offset + 1280]
                time.sleep(max(0, audio_start + (offset + len(chunk)) / 32000 - time.monotonic()))
                ws.send(chunk)
                try:
                    if receive(ws, 0):
                        raise TrialError('Assessment ended before the complete audio was sent')
                except TimeoutError:
                    pass
            recording_end = audio_start + len(pcm) / 32000
            ws.send('{"type":"end"}')
            deadline = time.monotonic() + 20
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TrialError('Assessment timed out')
                if receive(ws, remaining):
                    break
            finished = time.monotonic()
        if not any(w.get('PhoneInfos') or w.get('PhoneInfo') for r in results for w in r.get('Words', [])):
            raise TrialError('No phoneme detail; not an accepted evaluation')
        return {'results': results, 'automaticPassDecision': None,
                'timing': {'audioMs': round(len(pcm) / 32),
                           'connectionSetupMs': round((audio_start - started) * 1000),
                           'afterRecordingMs': round((finished - recording_end) * 1000),
                           'totalMs': round((finished - started) * 1000)}}
    finally:
        raw.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--quota-and-spend-confirmed', action='store_true')
    parser.add_argument('--limit', type=int, default=1)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--interface', type=int, default=9)
    parser.add_argument('--strictness-comparison', action='store_true')
    args = parser.parse_args()
    cases = fixtures(args.strictness_comparison)
    score_coeff = 4.0 if args.strictness_comparison else 1.5
    if not 1 <= args.limit <= len(cases) or not 0 <= args.offset < len(cases) or args.offset + args.limit > len(cases):
        raise TrialError('Invalid bounded fixture range')
    decoded = [(case, pcm_audio(case)) for case in cases[args.offset:args.offset + args.limit]]
    if not args.run:
        print(json.dumps({'mode': 'offline-preflight', 'provider': 'tencent-soe-new',
                          'cases': len(decoded), 'audioSeconds': round(sum(len(p) / 32000 for _, p in decoded), 2),
                          'cloudCalls': 0}))
        return
    if not args.quota_and_spend_confirmed:
        raise TrialError('Verify actual quota and explicit test spending authorization first; no calls made')
    check_remaining_budget(args.limit, score_coeff)
    config = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
    if not re.fullmatch(r'\d{5,20}', str(config.get('app_id', ''))) or not all(
        re.fullmatch(r'[A-Za-z0-9]{16,128}', config.get(k, '')) for k in ('secret_id', 'secret_key')
    ):
        raise TrialError('Invalid local credential format')
    report = {'status': 'running', 'provider': 'tencent-soe-new', 'evalMode': 4, 'scoreCoeff': score_coeff,
              'interfaceIndex': args.interface, 'containsUserRecording': False,
              'autoRetry': False, 'maximumAttempts': args.limit, 'cases': []}
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = PLAN.parent / f'tencent-trial-{stamp}.json'
    def save():
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for case, pcm in decoded:
        entry = {'id': case['id'], 'expectedCorrect': case['expectedCorrect'], 'status': 'attempt-started'}
        report['cases'].append(entry)
        save()  # Preserve uncertain attempts before crossing the billing boundary.
        try:
            entry.update(result=assess(config, case['reference'], pcm, args.interface, score_coeff), status='received')
        except Exception as error:
            entry.update(status='failed-or-uncertain', error=str(error) if isinstance(error, TrialError) else type(error).__name__)
            report['status'] = 'stopped-on-first-error'
            save()
            raise TrialError(entry['error']) from None
        save()
        print(json.dumps({'id': entry['id'], 'timing': entry['result']['timing']}), flush=True)
    report['status'] = 'completed-public-fixtures-only-not-human-acceptance'
    save()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, TrialError) else type(error).__name__)
        raise SystemExit(1)
