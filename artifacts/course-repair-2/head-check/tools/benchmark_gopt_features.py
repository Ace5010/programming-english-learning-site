import hashlib, importlib.util, json, pathlib, sys, time, zipfile
import numpy as np
import torch
project=pathlib.Path(__file__).resolve().parents[1]
root=project/'.runtime/pronunciation'
repo=root/'candidates/gopt-bed909daf8eca035095871e51642525acc5b9b55'
spec=importlib.util.spec_from_file_location('gopt_model',repo/'src/models/gopt.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
torch.set_num_threads(6)
torch.set_num_interop_threads(1)
z=zipfile.ZipFile(root/'gopt-data.zip')
def array(name):
    with z.open('seq_data_librispeech/'+name+'.npy') as f:return np.load(f,allow_pickle=False)
x=array('te_feat');phn=array('te_label_phn');utt=array('te_label_utt')
# Match the official GoPDataset exactly: normalize valid prefix, retain zero padding.
normalized=np.zeros_like(x)
for i in range(len(x)):
    for j in range(x.shape[1]):
        if x[i,j,0] == 0:break
        normalized[i,j]=(x[i,j]-3.203)/4.045
x=normalized
utt=utt/5
start=time.perf_counter()
m=torch.nn.DataParallel(module.GOPT(embed_dim=24,num_heads=1,depth=3,input_dim=84))
checkpoint=repo/'pretrained_models/gopt_librispeech/best_audio_model.pth'
m.load_state_dict(torch.load(checkpoint,map_location='cpu',weights_only=True),strict=True);m.eval()
load_ms=(time.perf_counter()-start)*1000
pred=[];u=[];times=[]
with torch.inference_mode():
    m(torch.from_numpy(x[:1]).float(),torch.from_numpy(phn[:1,:,0]).float())
    for i in range(len(x)):
        a=torch.from_numpy(x[i:i+1]).float();b=torch.from_numpy(phn[i:i+1,:,0]).float()
        start=time.perf_counter();r=m(a,b);times.append((time.perf_counter()-start)*1000)
        pred.append(r[5].numpy().squeeze());u.append([v.item() for v in r[:5]])
pred=np.array(pred);u=np.array(u);mask=phn[:,:,1]>=0
result={'status':'official-feature-evaluation-only','sourceRevision':repo.name[5:], 'checkpointSha256':hashlib.sha256(checkpoint.read_bytes()).hexdigest(),'datasetZipSha256':hashlib.sha256((root/'gopt-data.zip').read_bytes()).hexdigest(),'torch':torch.__version__,'nUtterances':len(x),'nScoredPhones':int(mask.sum()),'phonePcc':float(np.corrcoef(pred[mask],phn[:,:,1][mask])[0,1]),'phoneMse':float(np.mean((pred[mask]-phn[:,:,1][mask])**2)), 'utterancePcc':np.corrcoef(u.T,utt.T)[:5,5:].diagonal().tolist(),'modelLoadMs':load_ms,'medianScoreHeadMs':float(np.median(times)),'p95ScoreHeadMs':float(np.percentile(times,95)),'notComparableToTencentLatency':'Excludes Kaldi acoustic inference, alignment, GOP extraction, and audio loading. No course fixtures assessed; raw-audio path blocked by absent Linux/Kaldi.'}
out=project/'artifacts/course-upgrade/pre-push/pronunciation/gopt-official-features-benchmark.json';out.write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
