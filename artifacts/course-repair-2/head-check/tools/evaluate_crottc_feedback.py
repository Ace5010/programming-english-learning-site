"""Screen replacement policy on fixed public cases and an opt-in local recording."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import sys

import numpy as np
from benchmark_replacement_pronunciation import block_network
from crottc_pronunciation import CrottcAssessment, VERSION
from local_pronunciation import ROOT, RUNTIME, decode, ARPA

OUT = ROOT/'artifacts/course-upgrade/pre-push/pronunciation'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--private-sample', type=Path)
    parser.add_argument('--words-only', action='store_true')
    args = parser.parse_args()
    if args.private_sample:
        args.private_sample = args.private_sample.resolve()
        args.private_sample.relative_to((RUNTIME/'private-diagnostic').resolve())
    sys.addaudithook(block_network)
    engine = CrottcAssessment()
    engine.assess((ROOT/'public/audio/daily/aria/goodbye.mp3').read_bytes(), 'Goodbye')
    report = {'version':VERSION, 'cloudCalls':0, 'networkDisabled':True, 'cases':[]}
    destination = OUT/f'{VERSION}-evaluation.json'
    official = json.loads((OUT/'crottc-replacement-results.json').read_text(encoding='utf-8'))
    report['ctcMatchesOfficialBundle'] = True
    for case in official['cases']:
        if args.words_only and 'annotations' in case:
            continue
        data = (ROOT/case['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == case['sha256']
        result = engine.assess(data, case['reference'])
        # Reuse the report's already completed acoustic inference; no duplicated compute.
        if result.get('heardPhones') is not None:
            expected = [ARPA[p.upper()] for p in case['result']['ctc'] if p.upper() in ARPA]
            assert expected == result['heardPhones'], case['id']
        row = {k:v for k,v in case.items() if k != 'result'}
        row['result'] = result
        report['cases'].append(row)
        destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(case['id'],result['status'],result['elapsedMs'],flush=True)
    # Check actual complete feedback on the authorized private fixture, without publication.
    if args.private_sample:
        result = engine.assess(args.private_sample.read_bytes(), 'Goodbye')
        (RUNTIME/'private-diagnostic/crottc-feedback.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print('private sample',result['status'],result['elapsedMs'],flush=True)
    report['controls'] = {}
    for name, wave in [('silence', np.zeros(16000,dtype='float32')),
                       ('noise',np.random.default_rng(42).normal(0,.01,16000).astype('float32')),
                       ('tone',(.1*np.sin(2*np.pi*440*np.arange(16000)/16000)).astype('float32'))]:
        report['controls'][name] = engine.assess_wave(wave,'Hello')
    report['summary'] = {}
    for group, predicate in [('synthetic-correct',lambda c:c.get('expectedCorrect') is True),
                             ('synthetic-wrong',lambda c:c.get('expectedCorrect') is False),
                             ('human-acceptable',lambda c:c.get('group')=='acceptable'),
                             ('human-error',lambda c:c.get('group')=='clear-error')]:
        rows = [r for r in report['cases'] if predicate(r)]
        if not rows:
            continue
        report['summary'][group] = {'count':len(rows),
            'medianMs':statistics.median(r['result']['elapsedMs'] for r in rows),
            **{s:sum(r['result']['status']==s for r in rows) for s in ['supported','practice','uncertain']}}
    report['status'] = 'completed-screening-not-production'
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report['summary']))


if __name__ == '__main__':
    main()
