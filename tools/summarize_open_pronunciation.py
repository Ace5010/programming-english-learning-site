"""Summarize recorded public-fixture results without issuing service calls."""
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/course-upgrade/pre-push/pronunciation'
names = ['pronounce-whole', 'pronounce-stream', 'open-phones', 'open-full']
summary = {'scope':'Public synthetic screening, not human accent acceptance or overall accuracy',
           'newCloudCalls':0, 'newServiceCostCny':0, 'candidates':[], 'caseComparison':[]}
rows_by_name = {}
for name in names:
    data = json.loads((OUT / (name+'-benchmark.json')).read_text(encoding='utf-8'))
    first = [c for c in data['cases'] if c['repeat']==0]
    rows = [c for c in data['cases'] if c['repeat']==1]
    assert len(first)==len(rows)==24
    assert [r['id'] for r in first] == [r['id'] for r in rows]
    stable = all(a['result']==b['result'] for a,b in zip(first,rows))
    times = sorted(r['computeMs'] for r in rows)
    result = {'candidate':name,'publicCases':24,'actualEvaluationsIncludingWarmup':49,
              'repeatedResultsIdentical':stable,'normalFlagged':sum(r['expectedCorrect'] and r['result']['flagged'] for r in rows),
              'wrongFlagged':sum(not r['expectedCorrect'] and r['result']['flagged'] for r in rows),
              'incompleteCoverageCases':sum(bool(r['result'].get('unscoredPositions')) for r in rows),
              'warmComputeMedianMs':statistics.median(times),'warmComputeP95NearestRankMs':times[math.ceil(.95*len(times))-1],
              'modelLoadMs':data['modelLoadMs'],'firstEvaluationMs':data['firstEvaluationMs']}
    summary['candidates'].append(result)
    rows_by_name[name]={r['id']:r for r in rows}
base=json.loads((OUT/'tencent-public-screening-summary.json').read_text(encoding='utf-8'))
strict=json.loads((OUT/'tencent-strictness-summary.json').read_text(encoding='utf-8'))
strict_rows={r['id']:r for r in strict['cases']}
for tc in base['cases']:
    key=tc['id']; op=rows_by_name['open-phones'][key]['result']
    item={'id':key,'expectedCorrect':tc['expectedCorrect'],'tencentBaseMismatch':tc['explicitMismatch'],
          'tencentStrictMismatch':strict_rows[key]['strictExplicitMismatch'] if key in strict_rows else None,
          'openRecognizedPhones':op['heard_phones'],'openExpectedPhones':op['expected_phones'],
          'openFlagged':op['flagged'],'openFullScore':rows_by_name['open-full'][key]['result']['score'],
          'openWordTranscription':rows_by_name['open-full'][key]['result']['transcribe']}
    for name in ['pronounce-whole','pronounce-stream']:
        item[name]=[{k:e[k] for k in ['phoneme','decoded','label']} for e in rows_by_name[name][key]['result']['events'] if e['label'] in ['mispronounced','omitted']]
    summary['caseComparison'].append(item)
summary['provenance']={}
for p in (ROOT/'.runtime/pronunciation/bench-models').glob('*/download-manifest.json'):
    summary['provenance'][p.parent.name]=json.loads(p.read_text(encoding='utf-8'))
(OUT/'open-source-comparison-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
for c in summary['candidates']:print(json.dumps(c))
