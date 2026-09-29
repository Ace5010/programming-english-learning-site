"""Bounded public-course-audio trial, not a production pronunciation grader.

Default is an offline preflight. --run additionally requires an explicitly
verified free quota and local credentials. Never prints signed URLs or secrets.
Protocol: https://www.xfyun.cn/doc/Ise/IseAPI.html
Suntone: https://www.xfyun.cn/doc/voiceservice/suntone/API.html
"""
import argparse
import base64
import datetime
import email.utils
import hashlib
import hmac
import json
import math
import pathlib
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLAN = ROOT / 'artifacts/course-upgrade/pre-push/pronunciation/cloud-test-plan.json'
CONFIG = ROOT / '.runtime/pronunciation/xfyun.json'
HOST = 'ise-api.xfyun.cn'
PATH = '/v2/open-ise'
SUNTONE_HOST = 'cn-east-1.ws-api.xf-yun.com'
SUNTONE_PATH = '/v1/private/s8e098720'
MAX_AUDIO_BYTES = 16000 * 2 * 5


class TrialError(Exception):
    """Only non-sensitive, locally constructed messages are allowed here."""


def signed_url(config, now=None, *, host=HOST, path=PATH):
    date = email.utils.format_datetime(now or datetime.datetime.now(datetime.timezone.utc), usegmt=True)
    canonical = f'host: {host}\ndate: {date}\nGET {path} HTTP/1.1'
    signature = base64.b64encode(hmac.new(config['api_secret'].encode(), canonical.encode(), hashlib.sha256).digest()).decode()
    authorization = f'api_key="{config["api_key"]}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature}"'
    query = urllib.parse.urlencode({'authorization': base64.b64encode(authorization.encode()).decode(), 'date': date, 'host': host})
    return f'wss://{host}{path}?{query}'


def public_cases():
    cases = json.loads(PLAN.read_text(encoding='utf-8'))['cases']
    if len(cases) != 10 or len({case['id'] for case in cases}) != 10:
        raise TrialError('Expected the existing ten distinct public audio fixtures')
    for case in cases:
        path = (ROOT / case['file']).resolve()
        if not path.is_relative_to((ROOT / 'public/audio').resolve()) or path.suffix != '.mp3':
            raise TrialError('Trial accepts only public course MP3 fixtures')
        if hashlib.sha256(path.read_bytes()).hexdigest() != case['sha256']:
            raise TrialError('Fixture changed; review the test plan before uploading')
        if not re.fullmatch(r'[A-Za-z]+[.!]?', case['reference']):
            raise TrialError('This initial trial accepts only single-word references')
    return cases


def decode_pcm(case):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i',
                             str(ROOT / case['file']), '-f', 's16le', '-ar', '16000',
                             '-ac', '1', 'pipe:1'], capture_output=True, timeout=20)
    if result.returncode or not 8000 <= len(result.stdout) <= MAX_AUDIO_BYTES or len(result.stdout) % 2:
        raise TrialError('Audio conversion failed or duration is outside 0.25 to 5 seconds')
    return result.stdout


def messages(app_id, reference, pcm):
    if not re.fullmatch(r'[A-Za-z]+[.!]?', reference):
        raise TrialError('Expected one English word')
    if not 8000 <= len(pcm) <= MAX_AUDIO_BYTES or len(pcm) % 2:
        raise TrialError('Expected 0.25 to 5 seconds of 16 kHz mono PCM16')
    yield {'common': {'app_id': app_id}, 'business': {
        'sub': 'ise', 'ent': 'en_vip', 'category': 'read_word', 'cmd': 'ssb',
        'text': '\ufeff[word]\n' + reference.rstrip('.!'), 'tte': 'utf-8', 'ttp_skip': True,
        'aue': 'raw', 'auf': 'audio/L16;rate=16000', 'rstcd': 'utf8',
        'rst': 'entirety', 'ise_unite': '1', 'extra_ability': 'multi_dimension;syll_phone_err_msg',
    }, 'data': {'status': 0}}
    for offset in range(0, len(pcm), 1280):
        yield {'business': {'cmd': 'auw', 'aus': 1 if offset == 0 else 2},
               'data': {'status': 1, 'data': base64.b64encode(pcm[offset:offset+1280]).decode()}}
    yield {'business': {'cmd': 'auw', 'aus': 4}, 'data': {'status': 2, 'data': ''}}


def parse_result(encoded):
    if not isinstance(encoded, str) or len(encoded) > 1400000:
        raise TrialError('Missing or oversized assessment result')
    try:
        raw = base64.b64decode(encoded, validate=True)
        xml = raw.decode('utf-8-sig')
        if '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
            raise TrialError('Unsupported XML declaration')
        root = ET.fromstring(xml)
    except (ValueError, UnicodeError, ET.ParseError):
        raise TrialError('Invalid assessment XML') from None
    # Attributes describe aligned targets, not an independently recognized transcript.
    fields = {'content', 'total_score', 'accuracy_score', 'standard_score', 'fluency_score',
              'integrity_score', 'is_rejected', 'except_info', 'dp_message', 'beg_pos',
              'end_pos', 'syll_score', 'serr_msg', 'perr_msg', 'perr_level_msg'}
    nodes = [{'level': element.tag, **{key: value[:1000] for key, value in element.attrib.items() if key in fields}}
             for element in root.iter() if element.tag in {'read_word', 'sentence', 'word', 'syll', 'phone'}]
    phones = [node for node in nodes if node['level'] == 'phone' and node.get('content') not in {'sil', 'silv', 'fil'}]
    if not phones:
        raise TrialError('Assessment returned no phoneme detail')
    return {'provider': 'xfyun-ise', 'phonemeCount': len(phones), 'nodes': nodes,
            'pronunciationAccepted': False,
            'note': 'Trial evidence only; no inferred heard phones or automatic pass/fail threshold'}


def direct_socket(interface_index, host=HOST):
    if not interface_index:
        return None
    if sys.platform != 'win32' or not 0 < interface_index < (1 << 24):
        raise TrialError('Physical interface selection requires a valid Windows interface index')
    raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        raw.settimeout(12)
        raw.setsockopt(socket.IPPROTO_IP, 31, struct.pack('!I', interface_index))
        raw.connect(socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)[0][4])
        return raw
    except Exception:
        raw.close()
        raise


def assess(case, pcm, config, interface_index=None):
    # Installed only on the developer PC; no website or Android dependency.
    from websockets.sync.client import connect
    raw = direct_socket(interface_index)
    try:
        with connect(signed_url(config), sock=raw, proxy=None, open_timeout=15,
                     close_timeout=2, max_size=1500000, compression=None) as ws:
            for message in messages(config['app_id'], case['reference'], pcm):
                ws.send(json.dumps(message))
                # Surface errors before continuing to upload; do not retry a failed request.
                try:
                    reply = json.loads(ws.recv(timeout=0.04))
                except TimeoutError:
                    continue
                if reply.get('code') != 0:
                    code = reply.get('code')
                    raise TrialError(f'Service error {code if type(code) is int else "unknown"}')
                data = reply.get('data', {})
                if data.get('status') == 2:
                    return parse_result(data.get('data'))
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                reply = json.loads(ws.recv(timeout=max(0.01, deadline-time.monotonic())))
                if reply.get('code') != 0:
                    code = reply.get('code')
                    raise TrialError(f'Service error {code if type(code) is int else "unknown"}')
                data = reply.get('data', {})
                if data.get('status') == 2:
                    return parse_result(data.get('data'))
            raise TrialError('Assessment timed out')
    finally:
        if raw is not None:
            raw.close()


def encode_suntone_audio(pcm):
    # This endpoint documents MP3, not raw PCM. Keep the public source untouched.
    result = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error',
                             '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', 'pipe:0',
                             '-codec:a', 'libmp3lame', '-b:a', '32k',
                             '-write_xing', '0', '-id3v2_version', '0', '-f', 'mp3', 'pipe:1'],
                            input=pcm, capture_output=True, timeout=20)
    if result.returncode or not 1000 <= len(result.stdout) <= 30000:
        raise TrialError('Suntone MP3 conversion failed or exceeded trial bounds')
    return result.stdout


def suntone_messages(app_id, reference, mp3):
    if not re.fullmatch(r'[A-Za-z]+[.!]?', reference) or not 1000 <= len(mp3) <= 30000:
        raise TrialError('Expected one English word and a bounded trial MP3')
    # 32 kbit/s => 160 bytes per 40 ms. Final nonempty chunk carries status 2.
    for seq, offset in enumerate(range(0, len(mp3), 160)):
        status = 2 if offset + 160 >= len(mp3) else (0 if seq == 0 else 1)
        yield {'header': {'app_id': app_id, 'status': status}, 'parameter': {'st': {
            'lang': 'en', 'core': 'word', 'refText': reference.rstrip('.!'),
            'phoneme_output': 1, 'dict_type': 'CMU',
            # Omit dict_dialect and custom pronunciations to allow standard variants.
            'slack': 0, 'scale': 100, 'precision': 0.1,
            'attachAudioUrl': 0, 'getParam': 0, 'vad': 0,
            'result': {'encoding': 'utf8', 'compress': 'raw', 'format': 'plain'},
        }}, 'payload': {'data': {
            'encoding': 'lame', 'sample_rate': 16000, 'channels': 1, 'bit_depth': 16,
            'status': status, 'seq': seq, 'frame_size': 0,
            'audio': base64.b64encode(mp3[offset:offset+160]).decode(),
        }}}


def parse_suntone_result(encoded, reference):
    if not isinstance(encoded, str) or len(encoded) > 1400000:
        raise TrialError('Missing or oversized Suntone assessment')
    try:
        data = json.loads(base64.b64decode(encoded, validate=True).decode('utf-8-sig'))
    except (ValueError, UnicodeError):
        raise TrialError('Invalid Suntone assessment JSON') from None
    if not isinstance(data, dict) or data.get('eof') != 1:
        raise TrialError('Suntone assessment is incomplete')
    if str(data.get('refText', '')).strip().lower().rstrip('.!') != reference.lower().rstrip('.!'):
        raise TrialError('Suntone assessment reference does not match')
    result = data.get('result')
    if not isinstance(result, dict) or not isinstance(result.get('words'), list):
        raise TrialError('Suntone assessment has no word detail')

    def score_fields(value):
        if not isinstance(value, dict):
            return {}
        return {key: number for key, number in value.items()
                if key in {'pronunciation', 'overall', 'integrity', 'fluency', 'rhythm', 'prominence'}
                and type(number) in (int, float) and math.isfinite(number) and 0 <= number <= 100}

    def span(value):
        if not isinstance(value, dict):
            return {}
        return {key: number for key, number in value.items()
                if key in {'start', 'end'} and type(number) in (int, float)
                and math.isfinite(number) and 0 <= number <= 100000}

    words = []
    for word in result['words']:
        if not isinstance(word, dict):
            raise TrialError('Invalid Suntone word detail')
        phones = []
        phonemes = word.get('phonemes', [])
        if not isinstance(phonemes, list):
            raise TrialError('Invalid Suntone phoneme list')
        for phone in phonemes:
            if not isinstance(phone, dict):
                raise TrialError('Invalid Suntone phoneme detail')
            label = phone.get('phoneme')
            score = score_fields(phone)
            if isinstance(label, str) and 0 < len(label) <= 40 and 'pronunciation' in score:
                phones.append({'expectedPhoneme': label, **score,
                               'span': span(phone.get('span', {}))})
        words.append({'word': str(word.get('word', ''))[:100],
                      'readType': word.get('readType') if type(word.get('readType')) is int else None,
                      'scores': score_fields(word.get('scores', {})), 'phonemes': phones})
    phone_count = sum(len(word['phonemes']) for word in words)
    if not phone_count:
        raise TrialError('Suntone assessment returned no scored phonemes')
    # Allowlist evidence fields: omit application/token/record IDs, URLs and raw responses.
    return {'provider': 'xfyun-suntone', 'phonemeCount': phone_count, 'words': words,
            'scores': score_fields(result), 'warningCodes': [item['code'] for item in result.get('warning', [])
                if isinstance(item, dict) and type(item.get('code')) is int],
            'pronunciationAccepted': False,
            'note': 'Expected phoneme scores only; no inferred heard phones or automatic pass threshold'}


def assess_suntone(case, mp3, config, interface_index=None):
    from websockets.sync.client import connect
    raw = direct_socket(interface_index, SUNTONE_HOST)

    def final_result(reply):
        header = reply.get('header', {})
        if header.get('code') != 0:
            code = header.get('code')
            raise TrialError(f'Suntone service error {code if type(code) is int else "unknown"}')
        if header.get('status') == 2:
            return parse_suntone_result(reply.get('payload', {}).get('result', {}).get('text'), case['reference'])
        return None

    try:
        with connect(signed_url(config, host=SUNTONE_HOST, path=SUNTONE_PATH), sock=raw,
                     proxy=None, open_timeout=15, close_timeout=2, max_size=1500000,
                     compression=None) as ws:
            for message in suntone_messages(config['app_id'], case['reference'], mp3):
                ws.send(json.dumps(message))
                try:
                    result = final_result(json.loads(ws.recv(timeout=0.04)))
                except TimeoutError:
                    continue
                if result is not None:
                    return result
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                result = final_result(json.loads(ws.recv(timeout=max(0.01, deadline-time.monotonic()))))
                if result is not None:
                    return result
            raise TrialError('Suntone assessment timed out')
    finally:
        if raw is not None:
            raw.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--free-quota-confirmed', action='store_true')
    parser.add_argument('--limit', type=int, default=1, choices=range(1, 11))
    parser.add_argument('--start-index', type=int, default=0, choices=range(10))
    parser.add_argument('--interface-index', type=int)
    parser.add_argument('--provider', choices=('ise', 'suntone'), default='ise')
    args = parser.parse_args()
    if args.start_index + args.limit > 10:
        parser.error('The selected range exceeds the ten approved fixtures')
    cases = public_cases()
    # Conversion and complete fixture validation happen before any cloud connection.
    prepared = [(case, decode_pcm(case)) for case in cases]
    uploads = [encode_suntone_audio(pcm) if args.provider == 'suntone' else pcm for _, pcm in prepared]
    print(json.dumps({'preflight': 'passed', 'provider': args.provider, 'fixtures': len(prepared), 'assessmentRequests': 0,
                      'containsUserRecording': False}))
    if not args.run:
        return 0
    if not args.free_quota_confirmed:
        raise TrialError('Verify the account free quota before running this trial')
    if not CONFIG.exists():
        raise TrialError('Local XFYun credentials are not configured')
    config = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
    if any(not isinstance(config.get(key), str) or not config[key].strip() or
           config[key].startswith('YOUR_') for key in ('app_id', 'api_key', 'api_secret')):
        raise TrialError('Local XFYun credentials are incomplete')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = ROOT / f'.runtime/pronunciation/xfyun/{args.provider}-trial-{stamp}.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {'provider': 'xfyun-' + args.provider, 'startedAt': stamp, 'status': 'running',
              'freeQuotaVerifiedByOperator': True, 'limit': args.limit, 'attemptedCalls': 0,
              'startIndex': args.start_index,
              'proxyUsed': False, 'interfaceIndex': args.interface_index,
              'containsUserRecording': False, 'cases': []}
    def save():
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    save()
    evaluator = assess_suntone if args.provider == 'suntone' else assess
    for index in range(args.start_index, args.start_index+args.limit):
        case, pcm = prepared[index]
        upload = uploads[index]
        report['attemptedCalls'] += 1
        item = {'id': case['id'], 'file': case['file'], 'sha256': case['sha256'], 'reference': case['reference'],
                'status': 'started', 'durationSeconds': len(pcm)/32000,
                'uploadSha256': hashlib.sha256(upload).hexdigest(), 'uploadBytes': len(upload)}
        report['cases'].append(item)
        save()  # An interruption must not erase evidence of an attempted call.
        started = time.monotonic()
        try:
            item.update(result=evaluator(case, upload, config, args.interface_index), status='completed')
        except Exception as error:
            # Transport exceptions may include signed URLs; never persist or print their text.
            item.update(status='failed', error=str(error) if isinstance(error, TrialError) else type(error).__name__)
            report['status'] = 'stopped-on-error'
        item['elapsedMs'] = round((time.monotonic()-started)*1000)
        save()
        print(json.dumps({key: item[key] for key in ('id', 'status', 'elapsedMs')}), flush=True)
        if item['status'] == 'failed':
            return 1
    report['status'] = 'completed-awaiting-review'
    save()
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'error': str(error) if isinstance(error, TrialError) else type(error).__name__,
                          'automaticRetry': False}))
        raise SystemExit(1) from None
