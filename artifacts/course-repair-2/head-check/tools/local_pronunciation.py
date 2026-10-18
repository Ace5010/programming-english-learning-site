"""Experimental offline phoneme feedback; never writes learning progress.

Uses pinned OpenPronounce recognition with a separate conservative feedback policy.
No TTS similarity score, word-spelling penalty, or cloud API.
"""
import functools
import itertools
import os
from pathlib import Path
import re
import subprocess
import sys
import time

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime/pronunciation'
VERSION = 'openpronounce-feedback-v2'
# Frozen before the held-out experiment; these are screening rules, not calibrated scores.
HEARD_MIN = .65
EXPECTED_MAX = .02
POSTERIOR_RATIO_MIN = 10
EXPECTED_PLAUSIBLE = .05
ARPA = dict(zip(
    'AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(),
    'ɑ æ ə ɑ aʊ aɪ b tʃ d ð ɛ ɚ eɪ f ɡ h ɪ i dʒ k l m n ŋ oʊ ɔɪ p ɹ s ʃ t θ ʊ u v w j z ʒ'.split()))


class AssessmentInputError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def decode(data):
    if not data or len(data) > 1_500_000:
        raise AssessmentInputError('audio-too-large' if data else 'empty-audio')
    try:
        result = subprocess.run(
            ['ffmpeg', '-v', 'error', '-protocol_whitelist', 'pipe', '-i', 'pipe:0',
             '-t', '20.1', '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'],
            input=data, capture_output=True, timeout=8, check=True)
    except (subprocess.SubprocessError, OSError) as exc:
        raise AssessmentInputError('invalid-audio') from exc
    audio = np.frombuffer(result.stdout, dtype='<i2').astype(np.float32) / 32768
    if not 3200 <= len(audio) <= 320000:
        raise AssessmentInputError('invalid-duration')
    return audio


def words(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower().replace('’', "'"))


def strong_substitution(heard, expected):
    return heard >= HEARD_MIN and expected < EXPECTED_MAX and heard / max(expected, 1e-8) >= POSTERIOR_RATIO_MIN


class LocalAssessment:
    def __init__(self):
        os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', OPENPRONOUNCE_DEVICE='cpu')
        espeak = Path(os.environ['LOCALAPPDATA']) / 'CodeWordsBench/espeak-1.52'
        os.environ['PHONEMIZER_ESPEAK_LIBRARY'] = str(espeak / 'libespeak-ng.dll')
        os.environ['PHONEMIZER_ESPEAK_DATA_PATH'] = str(espeak / 'espeak-ng-data')
        os.environ['OPENPRONOUNCE_PHONEME_MODEL'] = str(RUNTIME / 'bench-models/wav2vec2-lv-60-espeak-cv-ft')
        sys.path.insert(0, str(RUNTIME / 'candidates/OpenPronounce-74bc17ea406e'))
        import torch
        import cmudict
        from openpronounce import phones
        from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
        self.torch, self.phones, self.dictionary = torch, phones, cmudict.dict()
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        phones._load_model()
        word_model = RUNTIME / 'bench-models/wav2vec2-large-960h'
        self.word_processor = Wav2Vec2Processor.from_pretrained(str(word_model), local_files_only=True)
        self.word_model = Wav2Vec2ForCTC.from_pretrained(str(word_model), local_files_only=True).eval()
        if not self.variants('hello'):
            raise RuntimeError('Pronunciation dictionary unavailable')

    @functools.lru_cache(maxsize=256)
    def variants(self, text):
        tokens = words(text)
        if not tokens or len(tokens) > 12:
            return ()
        choices = []
        for word in tokens:
            entries = []
            for entry in self.dictionary.get(word, []):
                if all(re.sub('[012]', '', p) in ARPA for p in entry):
                    entries.append(tuple(ARPA[re.sub('[012]', '', p)] for p in entry))
            # Dictionary absence is not silently turned into a pass.
            if not entries:
                return ()
            entries.extend(tuple(p) for p in self.phones.get_expected_phones(word)[1] if p)
            choices.append(tuple(dict.fromkeys(entries)))
        result = []
        for combination in itertools.islice(itertools.product(*choices), 64):
            sequence = tuple(itertools.chain.from_iterable(combination))
            positions = tuple(i for i, entry in enumerate(combination) for _ in entry)
            result.append((sequence, positions))
        return tuple(dict.fromkeys(result))

    def transcribe(self, audio):
        batch = self.word_processor(audio, sampling_rate=16000, return_tensors='pt', padding=True)
        with self.torch.inference_mode():
            logits = self.word_model(batch.input_values).logits
        return self.word_processor.batch_decode(logits.argmax(dim=-1))[0].strip()

    def assess(self, data, reference):
        start = time.perf_counter()
        if not isinstance(reference, str) or not 1 <= len(reference) <= 120 or not re.fullmatch(r"[A-Za-z'’ ,.!?-]+", reference):
            raise AssessmentInputError('invalid-reference')
        audio = decode(data)
        result = self.assess_wave(audio, reference)
        result['elapsedMs'] = round((time.perf_counter() - start) * 1000)
        return result

    def assess_wave(self, audio, reference):
        start = time.perf_counter()
        result = {'version':VERSION, 'experimental':True, 'reference':reference, 'status':'uncertain',
                  'reason':'insufficient-evidence', 'feedback':[], 'phones':[], 'transcript':'',
                  'recognizedWordsMatch':None, 'diagnostics':{'unconfirmedPhones':[]}}
        def finish():
            result['computeMs'] = round((time.perf_counter() - start) * 1000, 2)
            return result
        if len(audio) < 3200 or len(audio) > 320000 or not np.isfinite(audio).all():
            raise AssessmentInputError('invalid-duration')
        frames = [audio[i:i+320] for i in range(0, len(audio), 320)]
        rms = [float(np.sqrt(np.mean(f*f))) for f in frames]
        if sum(v > .008 for v in rms) < 6:
            result['reason'] = 'no-speech'
            return finish()
        candidates = self.variants(reference)
        if not candidates:
            result['reason'] = 'dictionary-missing'
            return finish()
        rec = self.phones.recognize_phones(audio)
        result['heardPhones'] = rec.phones
        if not rec.phones:
            result['reason'] = 'no-clear-phones'
            return finish()
        import Levenshtein
        target, word_positions = min(candidates, key=lambda c: Levenshtein.distance(c[0], rec.phones))
        result['referencePhones'] = list(target)
        result['transcript'] = self.transcribe(audio)
        recognized_variants = self.variants(result['transcript'])
        matches = bool({c[0] for c in candidates} & {c[0] for c in recognized_variants})
        result['recognizedWordsMatch'] = matches
        lexical_substitutions = set()
        if not matches:
            for lexical, _ in recognized_variants:
                for tag, i1, i2, j1, j2 in Levenshtein.opcodes(target, lexical):
                    if tag == 'replace' and i2-i1 == j2-j1:
                        lexical_substitutions.update((i, lexical[j]) for i,j in zip(range(i1,i2),range(j1,j2)))
        reference_words = words(reference)
        vocab_map = self.phones._token_ids_by_phone(rec.vocab, 'en')
        all_supported = True
        # One-to-one substitutions only; alignment gaps remain uncertain, not invented errors.
        for tag, i1, i2, j1, j2 in Levenshtein.opcodes(target, rec.phones):
            if tag in ('insert', 'delete') or i2-i1 != j2-j1:
                all_supported = False
                result['diagnostics']['unconfirmedPhones'].extend({'target':target[i], 'index':i} for i in range(i1, i2))
                continue
            for i, j in zip(range(i1, i2), range(j1, j2)):
                expected, heard = target[i], rec.phones[j]
                a, b = rec.spans[j]
                ids = vocab_map.get(expected, [])
                expected_p = float(np.exp(rec.log_posteriors[a:b][:, ids].max())) if ids and b > a else 0.
                heard_p = float(rec.confidences[j])
                detail = {'index':i, 'wordIndex':word_positions[i], 'word':reference_words[word_positions[i]],
                          'expected':expected, 'heard':heard, 'expectedPosterior':round(expected_p,5),
                          'heardPosterior':round(heard_p,5)}
                detail['state'] = 'supported' if expected == heard else 'uncertain'
                if expected != heard:
                    if strong_substitution(heard_p, expected_p) and (i, heard) in lexical_substitutions:
                        detail['state'] = 'practice'
                        result['feedback'].append(dict(detail))
                    elif matches and expected_p >= EXPECTED_PLAUSIBLE:
                        detail['state'] = 'supported'
                    else:
                        all_supported = False
                        result['diagnostics']['unconfirmedPhones'].append({'target':expected, 'index':i})
                result['phones'].append(detail)
        if result['feedback']:
            result.update(status='practice', reason='phoneme-substitution')
        elif all_supported and matches:
            result.update(status='supported', reason='phonetic-evidence-agrees')
        return finish()
