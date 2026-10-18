"""Verify daily-course text, manifests, MP3 hashes, and complete audio decoding."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'src/dailyCourse.ts'
AUDIO_DIR = ROOT / 'public/audio/daily'
VOICES = {'aria': 'en-US-AriaNeural', 'guy': 'en-US-GuyNeural'}
RATE = '+0%'
MANIFEST_NAME = 'neural-manifest.json'
ID_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_-]{0,119}$')


def load_phrases(source=SOURCE):
    """Use Node's TS stripping to read the actual exported course data."""
    source = Path(source).resolve()
    if not source.is_file():
        raise ValueError(f'Course source is missing: {source}')
    node = shutil.which('node')
    if not node:
        raise ValueError('Node.js with TypeScript stripping is required (Node 22.18+).')
    script = (
        "import {pathToFileURL} from 'node:url';"
        "const course=await import(pathToFileURL(process.argv[1]).href);"
        "if(!Array.isArray(course.dailyPhrases))throw new Error('dailyPhrases must be an array');"
        "process.stdout.write(JSON.stringify(course.dailyPhrases));"
    )
    result = subprocess.run(
        [node, '--experimental-strip-types', '--input-type=module', '--eval', script, str(source)],
        capture_output=True, encoding='utf-8', timeout=30, check=False,
    )
    if result.returncode:
        raise ValueError(f'Could not export dailyPhrases:\n{result.stderr.strip()}')
    try:
        phrases = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError('The course export did not produce valid JSON.') from exc
    if not isinstance(phrases, list) or not phrases:
        raise ValueError('dailyPhrases must contain at least one phrase.')
    seen = set()
    for phrase in phrases:
        if not isinstance(phrase, dict):
            raise ValueError('Each phrase must be an object.')
        phrase_id, text = phrase.get('id'), phrase.get('en')
        if not isinstance(phrase_id, str) or not ID_PATTERN.fullmatch(phrase_id):
            raise ValueError(f'Unsafe or invalid phrase ID: {phrase_id!r}')
        if phrase_id in seen:
            raise ValueError(f'Duplicate phrase ID: {phrase_id}')
        seen.add(phrase_id)
        if not isinstance(text, str) or not text.strip() or text != text.strip():
            raise ValueError(f'Phrase {phrase_id} needs nonempty, trimmed English text.')
        if not isinstance(phrase.get('zh'), str) or not phrase['zh'].strip():
            raise ValueError(f'Phrase {phrase_id} needs a Chinese translation.')
    return phrases


def course_revision(phrases):
    payload = json.dumps(
        sorted((phrase['id'], phrase['en']) for phrase in phrases),
        ensure_ascii=False, separators=(',', ':'),
    )
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]


def synthesis_hash(voice, text):
    return hashlib.sha256(f'{voice}\n{RATE}\n{text}'.encode('utf-8')).hexdigest()


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def load_manifest(audio_dir):
    path = Path(audio_dir) / MANIFEST_NAME
    if not path.exists():
        return None
    try:
        manifest = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f'Cannot read the daily audio manifest: {path}') from exc
    if not isinstance(manifest, dict) or manifest.get('version') != 1 or not isinstance(manifest.get('entries'), dict):
        raise ValueError(f'Unsupported daily audio manifest: {path}')
    return manifest


def audio_tools():
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise ValueError('FFmpeg and ffprobe must both be available on PATH for audio validation.')
    return ffmpeg, ffprobe


def inspect_audio(path, tools=None):
    path = Path(path)
    if not path.is_file() or path.stat().st_size < 100:
        raise ValueError('missing, empty, or implausibly small MP3')
    ffmpeg, ffprobe = tools or audio_tools()
    probe = subprocess.run([
        ffprobe, '-v', 'error', '-select_streams', 'a:0', '-show_entries',
        'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', str(path),
    ], capture_output=True, encoding='utf-8', timeout=30, check=False)
    if probe.returncode:
        raise ValueError(f'ffprobe failed: {probe.stderr.strip()}')
    try:
        data = json.loads(probe.stdout)
        stream = data['streams'][0]
        duration = float(data['format']['duration'])
        if stream['codec_name'] != 'mp3' or not math.isfinite(duration) or duration <= 0:
            raise ValueError('not a positive-duration MP3 stream')
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError(f'Invalid MP3 metadata: {exc}') from exc
    decoded = subprocess.run([
        ffmpeg, '-v', 'error', '-xerror', '-nostdin', '-threads', '1', '-i', str(path),
        '-map', '0:a:0', '-f', 'null', '-',
    ], capture_output=True, encoding='utf-8', timeout=30, check=False)
    if decoded.returncode:
        raise ValueError(f'MP3 decoding failed: {decoded.stderr.strip()}')
    return {
        'bytes': path.stat().st_size,
        'fileSha256': file_hash(path),
        'durationSeconds': round(duration, 6),
        'sampleRate': int(stream['sample_rate']),
        'channels': int(stream['channels']),
    }


def entry_matches(entry, path, phrase, voice):
    if not isinstance(entry, dict) or not Path(path).is_file():
        return False
    try:
        return (
            entry.get('id') == phrase['id']
            and entry.get('text') == phrase['en']
            and entry.get('voice') == voice
            and entry.get('rate') == RATE
            and entry.get('synthesisSha256') == synthesis_hash(voice, phrase['en'])
            and entry.get('bytes') == Path(path).stat().st_size
            and entry['bytes'] >= 100
            and math.isfinite(entry['durationSeconds']) and entry['durationSeconds'] > 0
            and entry.get('fileSha256') == file_hash(path)
        )
    except (OSError, KeyError, TypeError, ValueError):
        return False


def verify(source=SOURCE, audio_dir=AUDIO_DIR, workers=4):
    phrases = load_phrases(source)
    audio_dir = Path(audio_dir).resolve()
    manifest = load_manifest(audio_dir)
    if manifest is None:
        raise ValueError(f'Daily audio manifest is missing: {audio_dir / MANIFEST_NAME}')
    errors = []
    revision = course_revision(phrases)
    if manifest.get('revision') != revision:
        errors.append('manifest revision does not match current English text/IDs')
    if manifest.get('phraseCount') != len(phrases):
        errors.append('manifest phraseCount does not match the course')
    if manifest.get('voices') != VOICES or manifest.get('rate') != RATE:
        errors.append('manifest voices/rate do not match Aria/Guy at normal synthesis speed')
    expected = {f'{folder}/{phrase["id"]}.mp3' for folder in VOICES for phrase in phrases}
    actual = {path.relative_to(audio_dir).as_posix() for path in audio_dir.glob('*/*.mp3')}
    for relative in sorted(expected - actual):
        errors.append(f'missing audio: {relative}')
    for relative in sorted(actual - expected):
        errors.append(f'unexpected audio: {relative}')
    for relative in sorted(set(manifest['entries']) - expected):
        errors.append(f'unexpected manifest entry: {relative}')
    tools = audio_tools()
    jobs = [(folder, voice, phrase) for folder, voice in VOICES.items() for phrase in phrases]

    def check(job):
        folder, voice, phrase = job
        relative = f'{folder}/{phrase["id"]}.mp3'
        entry = manifest['entries'].get(relative)
        path = audio_dir / relative
        if not entry_matches(entry, path, phrase, voice):
            return relative, 'text, voice, synthesis settings, bytes, or file hash differ from the manifest', 0
        try:
            decoded = inspect_audio(path, tools)
            if abs(decoded['durationSeconds'] - entry['durationSeconds']) > .001:
                raise ValueError('decoded duration differs from the manifest')
            return relative, None, decoded['bytes']
        except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
            return relative, str(exc), 0

    total_bytes = 0
    decoded_count = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for relative, error, size in pool.map(check, jobs):
            if error:
                errors.append(f'{relative}: {error}')
            else:
                decoded_count += 1
            total_bytes += size
    result = {
        'phrases': len(phrases), 'uniqueTexts': len({phrase['en'] for phrase in phrases}),
        'expectedMp3': len(expected), 'actualMp3': len(actual),
        'decodedMp3': decoded_count,
        'revision': revision, 'bytes': total_bytes, 'errors': errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return not errors


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--audio-dir', type=Path, default=AUDIO_DIR, help='May point at dist/audio/daily to verify a build.')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if args.workers < 1:
        parser.error('--workers must be positive')
    try:
        ok = verify(args.source, args.audio_dir, args.workers)
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f'Daily audio verification failed: {exc}', file=sys.stderr)
        return 1
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
