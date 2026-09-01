"""Generate fixed Piper Lessac audio for the CodeWords static site.

The script is incremental: existing MP3 files are skipped unless --force is used.
It reads the vocabulary JSON embedded in src/vocabulary.ts.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig


REPLACEMENTS = (
    (r"\bGitHub\b", "Git Hub"),
    (r"\bREADME\b", "read me"),
    (r"\bJSON\b", "jay son"),
    (r"\bSQL\b", "S Q L"),
    (r"\bGUI\b", "G U I"),
    (r"\bCLI\b", "C L I"),
    (r"\bAPI\b", "A P I"),
    (r"\bURL\b", "U R L"),
    (r"\bURI\b", "U R I"),
    (r"\bHTML\b", "H T M L"),
    (r"\bCSS\b", "C S S"),
    (r"\bHTTP\b", "H T T P"),
    (r"\bSSH\b", "S S H"),
    (r"\bnpm\b", "N P M"),
)


def prepare_speech(text: str) -> str:
    for pattern, replacement in REPLACEMENTS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def load_vocabulary(path: Path) -> list[dict[str, object]]:
    source = path.read_text(encoding="utf-8")
    prefix = "export const vocabulary: VocabularyItem[] = "
    start = source.index(prefix) + len(prefix)
    return json.loads(source[start:].rstrip().removesuffix(";"))


def encode_mp3(wav_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(wav_path),
            "-ac",
            "1",
            "-ar",
            "22050",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "40k",
            str(output_path),
        ],
        check=True,
    )


def synthesize(voice: PiperVoice, text: str, output_path: Path, length_scale: float) -> None:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temporary:
        wav_path = Path(temporary.name)
    try:
        with wave.open(str(wav_path), "wb") as wav_file:
            voice.synthesize_wav(
                prepare_speech(text),
                wav_file,
                syn_config=SynthesisConfig(length_scale=length_scale),
            )
        encode_mp3(wav_path, output_path)
    finally:
        wav_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    vocabulary = load_vocabulary(args.site / "src/vocabulary.ts")
    selected = [item for item in vocabulary if int(item["id"]) >= args.start]
    if args.limit:
        selected = selected[: args.limit]

    output_dir = args.site / "public/audio/piper-lessac"
    output_dir.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(args.model)

    total = len(selected) * 2
    completed = 0
    for item in selected:
        item_id = int(item["id"])
        jobs = (
            (str(item["word"]), output_dir / f"word-{item_id}.mp3", 1.18),
            (str(item["example"]), output_dir / f"example-{item_id}.mp3", 1.15),
        )
        for text, output_path, length_scale in jobs:
            if args.force or not output_path.exists():
                synthesize(voice, text, output_path, length_scale)
            completed += 1
            if completed % 20 == 0 or completed == total:
                print(f"Generated or verified {completed}/{total}", flush=True)

    test_path = output_dir / "voice-test.mp3"
    if args.force or not test_path.exists():
        synthesize(voice, "repository, function, variable, commit", test_path, 1.18)

    hero_path = output_dir / "hero.mp3"
    if args.force or not hero_path.exists():
        synthesize(voice, "repository, branch, commit, clone, fork, merge", hero_path, 1.18)


if __name__ == "__main__":
    main()
