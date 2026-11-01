"""Failure-mode checks for audio boundaries and bounded processing."""
import unittest
import numpy as np
from generate_clear_slow_audio import matched_groups, normalized_clip, segments

def boundary(text,start,duration):
    return {'text':text,'offset':round(start*1e7),'duration':round(duration*1e7)}

class ClearAudioTests(unittest.TestCase):
    def test_spelled_initialism_keeps_all_letters(self):
        groups=matched_groups([{'spoken':'U S'},{'spoken':'student'}],[boundary('U',0,.3),boundary('S',.4,.3),boundary('student',1,.7)])
        self.assertEqual([len(g) for g in groups],[2,1])

    def test_missing_or_merged_words_fail_instead_of_skipping(self):
        for boundaries in [[boundary('student',0,.5)],[boundary('USstudent',0,.5)]]:
            with self.assertRaises(ValueError):matched_groups([{'spoken':'U S'},{'spoken':'student'}],boundaries)

    def test_quiet_input_has_bounded_gain_and_silence_is_rejected(self):
        signal=np.sin(np.arange(24000)*2*np.pi*180/24000).astype('float32')*.001
        with self.assertRaises(ValueError):normalized_clip(signal)
        clip,analysis=normalized_clip(signal*10)
        self.assertLessEqual(analysis['gainDb'],6)
        self.assertLess(np.max(np.abs(clip)),.85)
        self.assertGreaterEqual(len(clip),24000+1920+2400)

    def test_context_target_is_checked_and_neighbors_are_excluded(self):
        pcm=np.zeros(24000*3,dtype='float32')
        pcm[2400:12000]=np.sin(np.arange(9600)*2*np.pi*200/24000)*.2
        pcm[24000:36000]=np.sin(np.arange(12000)*2*np.pi*600/24000)*.2
        bounds=[boundary('Live',.1,.4),boundary('here',1,.5)]
        entry={'text':'live@verb','spoken':'Live here.','targetIndex':0,'targetWord':'live'}
        result=list(segments(pcm,[entry],bounds))[0][1]
        self.assertLess(len(result),24000)
        with self.assertRaises(ValueError):list(segments(pcm,[{**entry,'targetIndex':1}],bounds))
        with self.assertRaises(ValueError):list(segments(pcm,[{**entry,'targetIndex':9}],bounds))

if __name__=='__main__':unittest.main()
