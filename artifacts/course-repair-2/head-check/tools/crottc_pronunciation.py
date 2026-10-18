"""Experimental CROTTC acoustic phones + unprompted Whisper small transcription.

The CTC path is verified against the official bundle's p_ctc_feat. Its slow
autoregressive decoder is not used. No TTS similarity or course progress writes.
"""
import importlib.util
import json
import os
import re
from types import SimpleNamespace

import numpy as np
from local_pronunciation import LocalAssessment, RUNTIME, ARPA, words

VERSION = 'crottc-whisper-word-v2'


def normalize_spoken_number(text):
    """Normalize an isolated cardinal, independent of the requested answer."""
    names = ('zero one two three four five six seven eight nine ten eleven '
             'twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty').split()
    match = re.fullmatch(r'\s*(0|[1-9]|1[0-9]|20)[.!?]?\s*', text)
    return names[int(match[1])] if match else text


class CrottcPhones:
    def __init__(self, torch):
        self.torch = torch
        folder = RUNTIME/'bench-models/CROTTC-IF-l2-arctic'
        manifest = json.loads((folder/'download-manifest.json').read_text(encoding='utf-8'))
        if manifest['revision'] != '9149e5107b3332b9aa3f5573f6328a4e312006ad':
            raise RuntimeError('Unvalidated CROTTC checkpoint revision')
        spec = importlib.util.spec_from_file_location('crottc_feedback_bundle', folder/'custom_interface.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.bundle = module.from_pretrained(folder, device='cpu', overrides=[
            'ctc_decode_weight=0.99', 'output_folder=' + (RUNTIME/'replacement-work').as_posix()])
        self.modules = self.bundle.brain.modules
        self.modules.eval()
        self.labels = self.bundle.label_encoder.decode_ndim(list(range(44)))
        self.vocab = tuple(ARPA.get(p.upper(), '<'+p+'>') for p in self.labels)

    def logits(self, audio):
        with self.torch.inference_mode():
            wave = self.torch.from_numpy(np.asarray(audio, dtype=np.float32).copy())[None]
            features = self.modules.perceived_ssl(wave)
            if features.ndim == 4:
                features = features[self.bundle.brain.hparams.preceived_ssl_emb_layer]
            projected = self.modules.enc(features)
            if hasattr(self.modules, 'ConformerEncoder'):
                projected, _ = self.modules.ConformerEncoder(projected)
            return self.torch.log_softmax(self.modules.ctc_lin(projected), dim=-1)[0]

    def recognize_phones(self, audio):
        logp = self.logits(audio).cpu().numpy()
        ids = logp.argmax(axis=-1)
        phones, confidence, spans = [], [], []
        start = 0
        for end in range(1, len(ids)+1):
            if end < len(ids) and ids[end] == ids[start]:
                continue
            token = int(ids[start])
            phone = self.vocab[token]
            if not phone.startswith('<'):
                phones.append(phone)
                confidence.append(float(np.exp(logp[start:end, token]).max()))
                spans.append((start, end))
            start = end
        return SimpleNamespace(phones=phones, confidences=confidence, spans=spans,
                               log_posteriors=logp, vocab=self.vocab)

    @staticmethod
    def get_expected_phones(word):
        # CMU dictionary variants are provided by the shared feedback policy.
        return None, []

    @staticmethod
    def _token_ids_by_phone(vocab, language):
        result = {}
        for i, phone in enumerate(vocab):
            result.setdefault(phone, []).append(i)
        return result


class CrottcAssessment(LocalAssessment):
    def __init__(self):
        os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                          WANDB_MODE='disabled', WANDB_DISABLED='true',
                          HF_HUB_DISABLE_TELEMETRY='1', TORCH_FORCE_WEIGHTS_ONLY_LOAD='1')
        import torch
        import cmudict
        from faster_whisper import WhisperModel
        from pathlib import Path
        self.torch, self.dictionary = torch, cmudict.dict()
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        self.phones = CrottcPhones(torch)
        snapshots = Path.home()/'.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots'
        candidates = sorted(p for p in snapshots.iterdir() if (p/'model.bin').is_file())
        if len(candidates) != 1:
            raise RuntimeError('Expected one locally cached Whisper small revision')
        self.whisper_revision = candidates[0].name
        self.word_model = WhisperModel(str(candidates[0]), device='cpu', compute_type='int8',
                                       cpu_threads=4, local_files_only=True)
        self.word_evidence = []
        self.raw_transcript = ''

    def transcribe(self, audio):
        segments, _ = self.word_model.transcribe(audio, language='en', beam_size=3,
                            condition_on_previous_text=False, vad_filter=False)
        segments = list(segments)
        self.raw_transcript = ' '.join(s.text.strip() for s in segments)
        self.word_evidence = [{'noSpeechProbability':round(s.no_speech_prob,4),
                              'averageLogProbability':round(s.avg_logprob,4)} for s in segments]
        reliable = [s for s in segments if s.no_speech_prob < .5 and s.avg_logprob > -1]
        return normalize_spoken_number(' '.join(s.text.strip() for s in reliable))

    def assess_wave(self, audio, reference):
        self.word_evidence = []
        self.raw_transcript = ''
        if len(words(reference)) != 1:
            return {'version':VERSION, 'experimental':True, 'reference':reference,
                    'status':'uncertain', 'reason':'single-word-only', 'feedback':[],
                    'phones':[], 'transcript':'', 'recognizedWordsMatch':None,
                    'diagnostics':{'unconfirmedPhones':[]}, 'computeMs':0}
        result = super().assess_wave(audio, reference)
        result['version'] = VERSION
        result['wordEvidence'] = self.word_evidence
        result['rawTranscript'] = self.raw_transcript
        if result['reason'] == 'insufficient-evidence':
            result['reason'] = ('asr-low-confidence' if not result['transcript'] else
                                'phoneme-evidence-conflict' if result['recognizedWordsMatch'] else
                                'words-differ-phoneme-uncertain')
        result['whisperRevision'] = self.whisper_revision
        return result
