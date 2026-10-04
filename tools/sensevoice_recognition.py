"""Loopback trial of offline word recognition, without pronunciation grading."""
import os
import re
import time

import numpy as np
from faster_whisper.vad import VadOptions, get_speech_timestamps

from benchmark_sensevoice import load, normalized
from local_pronunciation import AssessmentInputError, decode

VERSION = 'sensevoice-asr-trial-v1'
VAD = VadOptions(threshold=.5, min_speech_duration_ms=100,
                 min_silence_duration_ms=150, speech_pad_ms=0)


class SenseVoiceRecognition:
    reference_pattern = r"[A-Za-z]{2,40}"

    def __init__(self):
        self.version = VERSION
        os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1')
        self.run, _, _ = load()
        # Warm both models before advertising the server as ready.
        get_speech_timestamps(np.zeros(16000, dtype=np.float32), VAD)

    def assess(self, data, reference):
        start = time.perf_counter()
        if not isinstance(reference, str) or not re.fullmatch(self.reference_pattern, reference):
            raise AssessmentInputError('invalid-reference')
        audio = decode(data)
        common = {'version': self.version, 'experimental': True, 'reference': reference,
                  'pronunciationGraded': False, 'rawAudioSaved': False, 'cloudCalls': 0}
        if not get_speech_timestamps(audio, VAD):
            return {**common, 'status': 'no-speech', 'transcript': '', 'matched': None,
                    'elapsedMs': round((time.perf_counter()-start)*1000)}
        recognized = self.run(audio)
        return {**common, 'status': 'recognized',
                'transcript': recognized['transcript'],
                'matched': normalized(recognized['transcript']) == normalized(reference),
                'modelMs': recognized['modelMs'],
                'elapsedMs': round((time.perf_counter()-start)*1000)}

    def transcribe(self, data):
        """Course transcription never receives an expected answer or awards credit."""
        start = time.perf_counter()
        audio = decode(data)
        common = {'version': self.version, 'pronunciationGraded': False,
                  'rawAudioSaved': False, 'cloudCalls': 0}
        if not get_speech_timestamps(audio, VAD):
            return {**common, 'status': 'no-speech', 'transcript': '',
                    'elapsedMs': round((time.perf_counter()-start)*1000)}
        recognized = self.run(audio)
        return {**common, 'status': 'recognized', 'transcript': recognized['transcript'],
                'modelMs': recognized['modelMs'],
                'elapsedMs': round((time.perf_counter()-start)*1000)}
