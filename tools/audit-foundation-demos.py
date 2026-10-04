"""Check controlled focus/pause differences in the packaged clips, not just playback."""
import json
from pathlib import Path
import subprocess
import sys
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_daily_audio import audio_tools

ROOT = Path(__file__).resolve().parent.parent
RATE = 16000

def measure(name):
    file = ROOT / 'public/audio/foundation/demos' / f'{name}.mp3'
    data = subprocess.run([audio_tools()[0], '-v', 'error', '-i', str(file), '-f', 's16le', '-ar', str(RATE), '-ac', '1', '-'], check=True, capture_output=True).stdout
    pcm = np.frombuffer(data, dtype=np.int16).astype(np.float64)
    step = RATE // 100
    rms = np.sqrt(np.mean(pcm[:len(pcm)//step*step].reshape(-1, step)**2, axis=1))
    active = np.flatnonzero(rms > max(90, rms.max() * .025))
    first, last = int(active[0]), int(active[-1])
    longest, current = 0, 0
    for value in rms[first:last + 1]:
        current = current + 1 if value <= max(90, rms.max() * .025) else 0
        longest = max(longest, current)
    pitches = []
    for pos in range(first*step, max(first*step+1, last*step-640), step):
        frame = pcm[pos:pos+640].copy()
        if len(frame) < 640 or np.sqrt(np.mean(frame**2)) < 100: continue
        frame = (frame - np.mean(frame)) * np.hanning(len(frame))
        correlation = np.correlate(frame, frame, 'full')[len(frame)-1:]
        if correlation[0] <= 0: continue
        low, high = RATE // 400, RATE // 65
        lag = low + int(np.argmax(correlation[low:high]))
        if correlation[lag] / correlation[0] > .4:
            pitches.append((pos / RATE, RATE / lag))
    start, end = first*.01, (last+1)*.01
    prefix = [pitch for time, pitch in pitches if time < start+(end-start)*.20]
    suffix = [pitch for time, pitch in pitches if time > start+(end-start)*.80]
    return {'duration': round(len(pcm)/RATE, 3), 'longestInternalSilenceMs': longest*10,
            'prefixPitchHz': round(float(np.median(prefix)), 1), 'suffixPitchHz': round(float(np.median(suffix)), 1)}

if __name__ == '__main__':
    values = {name: measure(name) for name in ['focus-i', 'focus-tea', 'ready-flow', 'ready-pause']}
    i, tea = values['focus-i'], values['focus-tea']
    assert i['prefixPitchHz']/i['suffixPitchHz'] > tea['prefixPitchHz']/tea['suffixPitchHz'] * 1.2, values
    assert values['ready-pause']['longestInternalSilenceMs'] >= 300, values
    assert values['ready-pause']['longestInternalSilenceMs'] > values['ready-flow']['longestInternalSilenceMs'] + 200, values
    report = {'clips': values, 'passed': True,
              'scope': 'Measured actual pitch distribution and internal pause contrast. This does not replace human pronunciation review.'}
    output = ROOT / 'artifacts/foundation-expansion'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'demo-acoustic-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps(report, ensure_ascii=False))
