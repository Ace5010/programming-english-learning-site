"""English-only adapter for the shared Q8 weights; no Observer hints or writes."""
import array
import os
from pathlib import Path
import sys
import time


class SharedQ8:
    def __init__(self):
        root = Path(os.environ.get('CODEWORDS_Q8_ROOT', 'D:/AI/Qwen3-ASR-1.7B'))
        library = root / 'runtime/transcribe-native-windows-x86_64-cpu-vulkan/transcribe.dll'
        weights = root / 'models/Qwen3-ASR-1.7B-Q8_0.gguf'
        if not library.is_file() or not weights.is_file():
            raise FileNotFoundError('Shared Q8 runtime/model missing; set CODEWORDS_Q8_ROOT or CODEWORDS_QWEN_BACKEND=original')
        os.environ['TRANSCRIBE_LIBRARY'] = str(library)
        self.dll_handle = os.add_dll_directory(str(library.parent))
        sys.path.insert(0, str(root / 'runtime/python'))
        import transcribe_cpp as tc
        devices = list(tc.backends())
        device = next((d for d in devices if d.kind == 'vulkan'), None)
        if device is None:
            device = next(d for d in devices if d.kind == 'cpu')
        self.model = tc.Model(weights, device=device)
        self.session = self.model.session(n_threads=6)
        self.backend = 'shared-q8-' + device.kind

    def __call__(self, audio):
        start = time.perf_counter()
        # Never load hotwords.json, domain.py, video metadata, or the expected answer.
        result = self.session.run(array.array('f', audio), language='en',
                                  timestamps='none', vocabulary=None, prompt=None)
        return {'transcript': result.text, 'modelMs': round((time.perf_counter()-start)*1000)}

    def close(self):
        self.session.close()
        self.model.close()
