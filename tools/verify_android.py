"""Check that a built APK contains exactly the validated web distribution, byte for byte."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('apk', type=Path)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
excluded = {'_headers', '_redirects', '_routes.json', '.nojekyll'}
expected = {f'assets/web/{file.relative_to(dist).as_posix()}': file for file in dist.rglob('*') if file.is_file() and file.name not in excluded}
assert 'assets/web/index.html' in expected, 'Build dist before verifying the APK'
with zipfile.ZipFile(args.apk) as apk:
    names = apk.namelist()
    assert len(names) == len(set(names)), 'Duplicate APK entries'
    actual = {name for name in names if name.startswith('assets/web/') and not name.endswith('/')}
    assert actual == expected.keys(), f'APK web assets differ: missing {expected.keys() - actual}, extra {actual - expected.keys()}'
    for name, file in expected.items():
        assert hashlib.sha256(apk.read(name)).digest() == hashlib.sha256(file.read_bytes()).digest(), f'Stale or damaged asset: {name}'
    assert not any(name.endswith(('.jks', '.keystore', '.pem', 'keystore.properties', 'local.properties', '.env')) for name in names), 'Private build configuration was bundled'
    assert all(file in names for file in ['AndroidManifest.xml', 'classes.dex', 'resources.arsc']), 'Missing Android package files'
    report = {
        'apk': args.apk.name, 'bytes': args.apk.stat().st_size,
        'sha256': hashlib.sha256(args.apk.read_bytes()).hexdigest(),
        'matchedWebFiles': len(actual),
        'mp3Files': len([name for name in actual if name.endswith('.mp3')]),
        'payloadMatchesDist': True, 'noSigningFilesBundled': True,
        'note': 'Archive/payload verification only; installation and native device behavior are separate checks.',
    }
if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
