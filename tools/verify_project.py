"""Verify that the consolidated project contains every required deliverable."""

from __future__ import annotations

import json
import hashlib
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "public/audio/piper-lessac"


def load_vocabulary() -> list[dict[str, object]]:
    source = (ROOT / "src/vocabulary.ts").read_text(encoding="utf-8")
    prefix = "export const vocabulary: VocabularyItem[] = "
    start = source.index(prefix) + len(prefix)
    return json.loads(source[start:].rstrip().removesuffix(";"))


def main() -> None:
    vocabulary = load_vocabulary()
    baseline = json.loads((ROOT / 'scripts/vocabulary-baseline.json').read_text(encoding='utf-8'))
    expansion = json.loads((ROOT / 'scripts/vocabulary-expansion.json').read_text(encoding='utf-8'))
    identities = baseline + expansion['additions']
    if len(baseline) != 3560 or len(vocabulary) != len(identities):
        raise SystemExit('词库必须保留原始 3,560 词，并完整包含补充清单。')
    if any(item['id'] != index + 1 for index, item in enumerate(identities)):
        raise SystemExit('词汇固定 ID 不连续或被重新编号。')
    if any(item['id'] != identity['id'] or item['word'] != identity['word']
           for item, identity in zip(vocabulary, identities)):
        raise SystemExit('词汇固定 ID 或单词发生意外变化。')
    if len({item['word'].lower() for item in vocabulary}) != len(vocabulary):
        raise SystemExit('词库包含重复单词。')
    required = [
        ROOT / "index.html",
        ROOT / "package.json",
        ROOT / "vite.config.ts",
        ROOT / "src/App.tsx",
        ROOT / "src/main.tsx",
        ROOT / "src/styles.css",
        ROOT / "tools/generate_piper_audio.py",
        ROOT / "tools/models/en_US-lessac-medium.onnx",
        ROOT / "tools/models/en_US-lessac-medium.onnx.json",
        ROOT / "sources/it-glossary/IT_Glossary.pdf",
        ROOT / "sources/it-glossary/IT_Glossary.txt",
        ROOT / "sources/beginner-english/初中.jsonl",
        ROOT / "sources/beginner-english/高中.jsonl",
        ROOT / "dist/index.html",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]

    audio_missing: list[str] = []
    # Piper is a frozen legacy set. Appended words use the two active voices.
    for item in baseline:
        item_id = int(item["id"])
        for name in (f"word-{item_id}.mp3", f"example-{item_id}.mp3"):
            path = AUDIO / name
            if not path.is_file() or path.stat().st_size == 0:
                audio_missing.append(name)

    for name in ("voice-test.mp3", "hero.mp3"):
        path = AUDIO / name
        if not path.is_file() or path.stat().st_size == 0:
            audio_missing.append(name)

    mp3_files = list(AUDIO.glob("*.mp3"))
    manifest = json.loads((ROOT / 'public/audio/neural-manifest.json').read_text(encoding='utf-8'))
    required_manifest = {(item['id'], kind) for item in expansion['additions'] for kind in ('word', 'example')}
    required_manifest.update((item['id'], 'example') for item in expansion['overrides'] if 'example' in item)
    for voice, voice_name in (('aria', 'en-US-AriaNeural'), ('guy', 'en-US-GuyNeural')):
        folder = ROOT / 'public/audio' / voice
        expected = ['voice-test.mp3'] + [f'{kind}-{item["id"]}.mp3' for item in vocabulary for kind in ('word', 'example')]
        for name in expected:
            path = folder / name
            if not path.is_file() or path.stat().st_size == 0:
                audio_missing.append(f'{voice}/{name}')
        actual = list(folder.glob('*.mp3'))
        if len(actual) != len(expected):
            audio_missing.append(f'{voice}: expected {len(expected)} files, found {len(actual)}')
        for item in vocabulary:
            for kind in ('word', 'example'):
                name = f'{voice}/{kind}-{item["id"]}.mp3'
                record = manifest.get(name)
                if record is None:
                    if (item['id'], kind) in required_manifest:
                        audio_missing.append(f'{name}: missing text manifest')
                    continue
                text = str(item[kind])
                fingerprint = hashlib.sha256(f'{voice_name}\n+0%\n{text}'.encode('utf-8')).hexdigest()
                if record.get('text') != text or record.get('voice') != voice_name or record.get('sha256') != fingerprint:
                    audio_missing.append(f'{name}: audio text does not match vocabulary')
                path = ROOT / 'public/audio' / name
                if record.get('fileSha256') and path.is_file():
                    if hashlib.sha256(path.read_bytes()).hexdigest() != record['fileSha256']:
                        audio_missing.append(f'{name}: audio file hash mismatch')
        print(f'{voice}: {len(actual)} MP3')
    print(f"项目：编程英语学习网站")
    print(f"词汇：{len(vocabulary)}")
    print(f"语音：{len(mp3_files)}")
    print(f"缺少项目文件：{len(missing)}")
    print(f"缺少或损坏语音：{len(audio_missing)}")

    if len(mp3_files) != 7122 or missing or audio_missing:
        if missing:
            print("缺少：" + ", ".join(missing))
        if audio_missing:
            print("语音问题：" + ", ".join(audio_missing[:20]))
        raise SystemExit(1)

    subprocess.run(['node', str(ROOT / 'scripts/verify-daily-assets.mjs')], cwd=ROOT, check=True)
    print("检查通过：完整项目已汇总。")


if __name__ == "__main__":
    main()
