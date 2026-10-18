"""Offline screen of the publisher's WavLM phoneme scoring pipeline.

Keep its threshold and scoring/alignment logic. Replace only network loaders
with strict local checkpoint loading and decode input audio in memory.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import statistics
import sys
import time

from local_pronunciation import ROOT, RUNTIME, decode
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                  HF_HUB_DISABLE_TELEMETRY='1', TORCH_FORCE_WEIGHTS_ONLY_LOAD='1',
                  NLTK_DATA=str(RUNTIME/'nltk-data'))
import numpy as np
import torch
from benchmark_replacement_pronunciation import block_network

OUT = ROOT/'artifacts/course-upgrade/pre-push/pronunciation'


def load_scorer():
    folder = RUNTIME/'bench-models/wavlm-phoneme-scorer'
    ctc_folder = RUNTIME/'bench-models/wav2vec2-xlsr-53-espeak-cv-ft'
    manifests = []
    for path in (folder,ctc_folder):
        manifest = json.loads((path/'download-manifest.json').read_text(encoding='utf-8'))
        for name,record in manifest['files'].items():
            with (path/name).open('rb') as stream:
                assert hashlib.file_digest(stream,'sha256').hexdigest()==record['sha256'],name
        manifests.append(manifest)
    assert manifests[0]['revision']=='19f6b9675d02a61dcd5b2aec0fdcc4364c1fc9da'
    spec = importlib.util.spec_from_file_location('learner_scorer_publisher',folder/'pipeline_v2.py')
    publisher = importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
    from transformers import WavLMConfig, WavLMModel, Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
    from g2p_en import G2p
    class LocalScorer(publisher.PronunciationAssessorV2):
        def _load_models(self):
            if self._backbone is not None:
                return
            # Publisher stores NumPy scalar validation metrics alongside tensors.
            # Permit only those numeric types, retaining weights-only loading.
            unsafe = set(torch.serialization.get_unsafe_globals_in_checkpoint(self._checkpoint_path))
            assert unsafe <= {'numpy.dtype', 'numpy._core.multiarray.scalar'}, unsafe
            with torch.serialization.safe_globals([np.dtype, np._core.multiarray.scalar,
                                                    np.dtypes.Float64DType, np.dtypes.Float32DType]):
                checkpoint = torch.load(self._checkpoint_path,map_location='cpu',weights_only=True)
            state = checkpoint['model_state']
            backbone = {k[len('backbone.'):]:v for k,v in state.items() if k.startswith('backbone.')}
            head = {k:v for k,v in state.items() if not k.startswith('backbone.')}
            base_folder = RUNTIME/'bench-models/CTC_for_IF-MDD/wavlm'
            config = WavLMConfig.from_pretrained(str(base_folder),local_files_only=True)
            config.output_hidden_states=False;config.mask_time_prob=0.
            self._backbone = WavLMModel(config)
            self._backbone.load_state_dict(backbone,strict=True)
            self._backbone.eval()
            self._fe_backbone = Wav2Vec2FeatureExtractor.from_pretrained(str(base_folder),local_files_only=True)
            self._scorer = publisher.PhoneScorerHead()
            self._scorer.load_state_dict(head,strict=True);self._scorer.eval()
            self._ctc_model,info = Wav2Vec2ForCTC.from_pretrained(str(ctc_folder),local_files_only=True,output_loading_info=True)
            assert not info['missing_keys'] and not info['unexpected_keys'],info
            self._ctc_model.eval()
            self._fe_ctc = Wav2Vec2FeatureExtractor.from_pretrained(str(ctc_folder),local_files_only=True)
            self._vocab = json.loads((ctc_folder/'vocab.json').read_text(encoding='utf-8'))
            self._blank_idx = self._vocab.get('<pad>',0)
            self._g2p = G2p()
        @staticmethod
        def load_audio(path_or_wave):
            audio = path_or_wave if isinstance(path_or_wave,np.ndarray) else decode(Path(path_or_wave).read_bytes())
            return torch.from_numpy(audio.copy())[None]
    scorer = LocalScorer(checkpoint_path=str(folder/'wavlm_finetuned.pt'),device=torch.device('cpu'))
    scorer._load_models()
    return scorer, manifests


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--authorized-private',action='store_true');args=parser.parse_args()
    torch.set_num_threads(6);torch.set_num_interop_threads(1)
    sys.addaudithook(block_network)
    started=time.perf_counter();scorer,manifests=load_scorer()
    report={'model':manifests[0]['repo'],'revision':manifests[0]['revision'],
            'alignmentRevision':manifests[1]['revision'],'networkDisabled':True,'cloudCalls':0,
            'threshold':scorer.pherr_threshold,'localAdaptation':'strict offline loading and FFmpeg decode only',
            'loadMs':round((time.perf_counter()-started)*1000),'cases':[]}
    def run(data,reference):
        started=time.perf_counter()
        with torch.inference_mode():
            result=scorer.assess(data,reference)
        result['elapsedMs']=round((time.perf_counter()-started)*1000)
        return result
    run(ROOT/'public/audio/daily/aria/goodbye.mp3','goodbye')
    if args.authorized_private:
        folder=RUNTIME/'private-diagnostic'
        private={'model':report['model'],'revision':report['revision'],'networkDisabled':True,
                 'notHumanPhoneticAnnotation':True,'cases':[]}
        for word in ['goodbye','three']:
            repeats=[run(folder/f'user-{word}.weba',word) for _ in range(3)]
            private['cases'].append({'reference':word,'results':repeats})
            print('private',word,json.dumps(repeats,ensure_ascii=True),flush=True)
        (folder/'learned-scorer-screening.json').write_text(json.dumps(private,ensure_ascii=False,indent=2),encoding='utf-8')
    plan=json.loads((OUT/'tencent-test-plan.json').read_text(encoding='utf-8'))['cases']
    plan+=json.loads((OUT/'replacement-human-plan.json').read_text(encoding='utf-8'))['cases']
    destination=OUT/'learned-scorer-screening.json'
    for case in plan:
        path=ROOT/case['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==case['sha256']
        result=run(path,case['reference'])
        report['cases'].append(dict(case,result=result))
        destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(case['id'],result.get('n_errors'),result['elapsedMs'],flush=True)
    report['controls']={name:run(wave,'Hello') for name,wave in [
        ('silence',np.zeros(16000,dtype=np.float32)),
        ('noise',np.random.default_rng(42).normal(0,.01,16000).astype(np.float32)),
        ('tone',(.1*np.sin(2*np.pi*440*np.arange(16000)/16000)).astype(np.float32))]}
    report['summary']={}
    for group,predicate in [('correct-word',lambda c:c.get('expectedCorrect') is True),
                            ('wrong-word',lambda c:c.get('expectedCorrect') is False),
                            ('human-acceptable',lambda c:c.get('group')=='acceptable'),
                            ('human-error',lambda c:c.get('group')=='clear-error')]:
        rows=[c for c in report['cases'] if predicate(c)]
        report['summary'][group]={'count':len(rows),'withErrorFlag':sum(c['result'].get('n_errors',0)>0 for c in rows),
            'unscored':sum('n_errors' not in c['result'] for c in rows),
            'medianMs':statistics.median(c['result']['elapsedMs'] for c in rows)}
    report['status']='screen-complete-not-production'
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report['summary']),flush=True)


if __name__=='__main__':main()
