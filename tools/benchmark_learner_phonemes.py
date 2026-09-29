"""Offline screening of learner-trained phone models, not pronunciation grading.

Public reports never contain private audio or private inference results. Models
receive audio alone. Exact dictionary agreement is a component diagnostic only.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import sys
import time

os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                  HF_HUB_DISABLE_TELEMETRY='1', TORCH_FORCE_WEIGHTS_ONLY_LOAD='1',
                  WANDB_MODE='disabled')
import numpy as np
import torch
from benchmark_replacement_pronunciation import block_network
from local_pronunciation import ROOT, RUNTIME, ARPA, decode

OUT = ROOT/'artifacts/course-upgrade/pre-push/pronunciation'
REPOS = {
    'l2arctic': 'wav2vec2-large-xlsr-53-l2-arctic-phoneme',
    'ifctc': 'CTC_for_IF-MDD',
    'cmubye': 'cmubye-phoneme-encoder',
    'huper': 'huper_recognizer',
    'mhubert': 'mHuBERT-147-ipa-ctc-ft',
}


def load_model(kind):
    folder = RUNTIME/'bench-models'/REPOS[kind]
    manifest = json.loads((folder/'download-manifest.json').read_text(encoding='utf-8'))
    for name, record in manifest['files'].items():
        with (folder/name).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != record['sha256']:
                raise ValueError('Model artifact hash mismatch: '+name)
    if kind == 'mhubert':
        # Publisher code (configuration + model, revision in manifest) reviewed:
        # local HuBERT config, linear projection, 2-layer BiLSTM, CTC head only.
        from transformers import AutoModel, Wav2Vec2FeatureExtractor
        processor = Wav2Vec2FeatureExtractor.from_pretrained(str(folder), local_files_only=True)
        model, loading = AutoModel.from_pretrained(str(folder), local_files_only=True,
            trust_remote_code=True, output_loading_info=True)
        assert not loading['missing_keys'] and not loading['unexpected_keys'], loading
        model.eval()
        labels = json.loads((folder/'ipa_map.json').read_text(encoding='utf-8'))['id2phone']
        blank = model.config.architecture['blank_id']
        def infer(audio):
            batch = processor(audio, sampling_rate=16000, return_tensors='pt')
            ids = model(**batch).logits[0].argmax(-1).tolist()
            phones = [labels[str(token)] for i,token in enumerate(ids)
                      if token != blank and (i == 0 or token != ids[i-1])]
            return ' '.join(phones)
    elif kind in ('l2arctic', 'cmubye', 'huper'):
        from transformers import AutoModelForCTC, AutoProcessor
        if kind == 'cmubye':
            # The release uses Transformers 5's nested processor JSON. Construct
            # the same feature extractor/tokenizer using this isolated 4.x runtime.
            from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2CTCTokenizer, Wav2Vec2Processor
            settings = json.loads((folder/'processor_config.json').read_text(encoding='utf-8'))
            tokenizer = Wav2Vec2CTCTokenizer(vocab_file=str(folder/'vocab.json'),
                pad_token='[PAD]', unk_token='[UNK]', bos_token='<s>', eos_token='</s>',
                word_delimiter_token='|', do_lower_case=False)
            expected_vocab = json.loads((folder/'vocab.json').read_text(encoding='utf-8'))
            expected_vocab.update({'<s>':42,'</s>':43})
            assert tokenizer.get_vocab() == expected_vocab
            processor = Wav2Vec2Processor(Wav2Vec2FeatureExtractor(**settings['feature_extractor']),
                                          tokenizer)
        else:
            processor = AutoProcessor.from_pretrained(str(folder), local_files_only=True)
        model, loading = AutoModelForCTC.from_pretrained(str(folder), local_files_only=True,
                                                        output_loading_info=True)
        assert not loading['missing_keys'] and not loading['unexpected_keys'], loading
        model.eval()
        def infer(audio):
            batch = processor(audio, sampling_rate=16000, return_tensors='pt')
            logits = model(**batch).logits
            if kind == 'huper':
                ids = logits[0].argmax(-1).tolist()
                # Use phone tokens, not character-oriented CTC detokenization.
                tokens = [processor.tokenizer.convert_ids_to_tokens(token)
                          for i,token in enumerate(ids)
                          if token != processor.tokenizer.pad_token_id
                          and (i == 0 or token != ids[i-1])]
                return ' '.join(token for token in tokens
                                if token not in {'<PAD>','<BOS>','<EOS>','<s>','</s>','|'})
            return processor.batch_decode(logits.argmax(-1))[0]
    else:
        from speechbrain.lobes.models.huggingface_transformers.wavlm import WavLM
        from speechbrain.lobes.models.VanillaNN import VanillaNN
        from speechbrain.nnet.linear import Linear
        from speechbrain.dataio.encoder import CTCTextEncoder
        from speechbrain.decoders import ctc_greedy_decode
        class ConfigOnlyWavLM(WavLM):
            def _from_pretrained(self, source, save_path, cache_dir, device=None, **kwargs):
                self.model = self.auto_class.from_config(self.config)
                if device is not None:
                    self.model.to(device)
        # Same modules/defaults as the publisher's inference.yaml; only construct
        # the base from local config before restoring the full trained checkpoint.
        ssl = ConfigOnlyWavLM(source=str(folder/'wavlm'), save_path=str(folder/'cache'),
                             freeze=False, freeze_feature_extractor=True, output_all_hiddens=False)
        enc = torch.nn.Sequential(VanillaNN(input_shape=[None,None,1024],
                    activation=torch.nn.LeakyReLU, dnn_blocks=2, dnn_neurons=384),
                    torch.nn.LayerNorm(384))
        projection = Linear(input_size=384, n_neurons=44)
        head = torch.nn.ModuleList([enc, projection])
        ssl.load_state_dict(torch.load(folder/'perceived_ssl.ckpt', map_location='cpu', weights_only=True), strict=True)
        head.load_state_dict(torch.load(folder/'model.ckpt', map_location='cpu', weights_only=True), strict=True)
        ssl.eval();head.eval()
        labels = CTCTextEncoder();labels.load(folder/'tokenizer.ckpt');labels.expect_len(44)
        def infer(audio):
            wave = torch.from_numpy(audio.copy())[None]
            logits = torch.log_softmax(projection(enc(ssl(wave))), dim=-1)
            tokens = ctc_greedy_decode(logits, torch.ones(1), blank_id=0)[0]
            return ' '.join(labels.decode_ndim(tokens))
    return infer, manifest


def compact_ipa(value):
    return value.replace(' ', '').replace('ˈ', '').replace('ˌ', '').replace('͡', '').replace('ʌ','ə')


def phonetic_text(kind, value):
    if kind in ('ifctc', 'huper'):
        # Keep unknown/error labels explicit; never turn them into agreement.
        mapping = dict(ARPA, DX='ɾ')
        return ''.join(mapping.get(p.upper(), '<'+p+'>') for p in value.split() if p != 'sil')
    if kind == 'mhubert':
        value = ' '.join(p for p in value.split() if p != 'sil')
        value = value.replace('g','ɡ').replace('ɹ̩','ɚ').replace('r','ɹ')
    if kind == 'cmubye':
        value = value.replace('g','ɡ').replace('ɝ','ɚ').replace('ʧ','tʃ').replace('ʤ','dʒ')
    return compact_ipa(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True, choices=REPOS)
    parser.add_argument('--authorized-private', action='store_true',
                        help='Recheck only the two recordings individually authorized by the user')
    args = parser.parse_args()
    import cmudict
    dictionary = cmudict.dict()
    torch.set_num_threads(6);torch.set_num_interop_threads(1)
    sys.addaudithook(block_network)
    started = time.perf_counter()
    infer, manifest = load_model(args.model)
    report = {'model':manifest['repo'], 'revision':manifest['revision'], 'networkDisabled':True,
              'cloudCalls':0, 'referencePrompt':False, 'calibratedAssessment':False,
              'loadMs':round((time.perf_counter()-started)*1000), 'cases':[]}
    destination = OUT/f'{args.model}-learner-screening.json'
    def run(wave):
        start = time.perf_counter()
        with torch.inference_mode():
            value = infer(wave)
        return {'rawPhones':value, 'compactPhones':phonetic_text(args.model,value),
                'modelMs':round((time.perf_counter()-start)*1000)}
    run(decode((ROOT/'public/audio/daily/aria/goodbye.mp3').read_bytes()))
    if args.authorized_private:
        private = {'model':manifest['repo'], 'revision':manifest['revision'],
                   'networkDisabled':True, 'notHumanPhoneticAnnotation':True, 'cases':[]}
        folder = RUNTIME/'private-diagnostic'
        for word in ['goodbye','three']:
            audio = decode((folder/f'user-{word}.weba').read_bytes())
            repeats = [run(audio) for _ in range(3)]
            private['cases'].append({'reference':word,'results':repeats})
            print('private', word, json.dumps(repeats,ensure_ascii=True), flush=True)
        (folder/f'{args.model}-learner-screening.json').write_text(json.dumps(private,ensure_ascii=False,indent=2),encoding='utf-8')
    plan = json.loads((OUT/'tencent-test-plan.json').read_text(encoding='utf-8'))['cases']
    plan += json.loads((OUT/'replacement-human-plan.json').read_text(encoding='utf-8'))['cases']
    cache = {}
    for case in plan:
        data = (ROOT/case['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == case['sha256']
        if case['file'] not in cache:
            cache[case['file']] = run(decode(data))
        result = dict(cache[case['file']])
        if len(case['reference'].split()) == 1:
            candidates = {''.join(ARPA[re.sub('[012]','',p)] for p in entry)
                          for entry in dictionary.get(case['reference'].lower(), [])}
            result['dictionaryExact'] = compact_ipa(result['compactPhones']) in candidates
        report['cases'].append(dict(case,result=result))
        destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(case['id'], json.dumps(result,ensure_ascii=True),flush=True)
    report['controls'] = {name:run(wave) for name,wave in [
        ('silence',np.zeros(16000,dtype=np.float32)),
        ('noise',np.random.default_rng(42).normal(0,.01,16000).astype(np.float32)),
        ('tone',(.1*np.sin(2*np.pi*440*np.arange(16000)/16000)).astype(np.float32))]}
    report['medianModelMsUniqueInputs'] = statistics.median(c['modelMs'] for c in cache.values())
    report['summary'] = {group:{'count':len(rows),
        'dictionaryExact':sum(c['result'].get('dictionaryExact',False) for c in rows)}
        for group,rows in [('correct-word',[c for c in report['cases'] if c.get('expectedCorrect') is True]),
                           ('wrong-word',[c for c in report['cases'] if c.get('expectedCorrect') is False])]}
    report['status'] = 'component-screen-complete-not-graded'
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report['summary']),flush=True)


if __name__ == '__main__':
    main()
