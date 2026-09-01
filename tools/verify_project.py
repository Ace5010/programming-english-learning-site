"""Verify that the consolidated project contains every required deliverable."""

from __future__ import annotations

import json
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
    for item in vocabulary:
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
    print(f"项目：编程英语学习网站")
    print(f"词汇：{len(vocabulary)}")
    print(f"语音：{len(mp3_files)}")
    print(f"缺少项目文件：{len(missing)}")
    print(f"缺少或损坏语音：{len(audio_missing)}")

    if len(vocabulary) != 3560 or len(mp3_files) != 7122 or missing or audio_missing:
        if missing:
            print("缺少：" + ", ".join(missing))
        if audio_missing:
            print("语音问题：" + ", ".join(audio_missing[:20]))
        raise SystemExit(1)

    print("检查通过：完整项目已汇总。")


if __name__ == "__main__":
    main()
