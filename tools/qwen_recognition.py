"""Cached Qwen3-ASR trial with the shared audio decoder and speech gate.

No reference prompt, private audio persistence, cloud calls, or course writes.
"""
import os

import numpy as np
from faster_whisper.vad import get_speech_timestamps
from local_pronunciation import ROOT, AssessmentInputError, decode
from sensevoice_recognition import SenseVoiceRecognition, VAD

VERSION = 'qwen3-asr-trial-v1'


class QwenRecognition(SenseVoiceRecognition):
    reference_pattern = r"[A-Za-z'’ ,.!?-]{2,120}"

    def __init__(self):
        os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
        import torch
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        from benchmark_qwen_asr import load
        infer, _, _ = load()
        def run(audio):
            result = infer(audio)
            if result.get('truncated'):
                raise AssessmentInputError('transcript-too-long')
            return result
        self.run = run
        self.version = VERSION
        get_speech_timestamps(np.zeros(16000, dtype=np.float32), VAD)
        self.run(decode((ROOT / 'public/audio/daily/aria/goodbye.mp3').read_bytes()))
