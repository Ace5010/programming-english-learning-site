"""Regression cases for numeric transcripts and rejected ASR candidates."""
from types import SimpleNamespace
import unittest
from crottc_pronunciation import CrottcAssessment, normalize_spoken_number
from local_pronunciation import LocalAssessment


class CrottcRegression(unittest.TestCase):
    def test_three_digit_reaches_pronunciation_dictionary(self):
        import cmudict
        engine = LocalAssessment.__new__(LocalAssessment)
        engine.dictionary = cmudict.dict()
        engine.phones = SimpleNamespace(get_expected_phones=lambda word: (None, []))
        self.assertEqual(engine.variants(normalize_spoken_number('3.')), engine.variants('three'))
        self.assertNotEqual(engine.variants(normalize_spoken_number('4')), engine.variants('three'))

    def test_normalization_preserves_ambiguous_or_mixed_text(self):
        for text in ['3.5', '03', '-3', '3 ships', 'tree', 'free', '', '30']:
            self.assertEqual(normalize_spoken_number(text), text)
        self.assertEqual(normalize_spoken_number(' 12! '), 'twelve')

    def test_low_confidence_candidate_is_visible_but_not_used(self):
        # Reproduces the user's Three recording: recognized text, insufficient confidence.
        engine = CrottcAssessment.__new__(CrottcAssessment)
        engine.word_model = SimpleNamespace(transcribe=lambda *args, **kwargs: (
            iter([SimpleNamespace(text=' Three.', no_speech_prob=.174, avg_logprob=-1.0245)]), None))
        self.assertEqual(engine.transcribe(None), '')
        self.assertEqual(engine.raw_transcript, 'Three.')

    def test_reliable_three_is_normalized_without_reference_hint(self):
        engine = CrottcAssessment.__new__(CrottcAssessment)
        def recognize(*args, **kwargs):
            self.assertNotIn('initial_prompt', kwargs)
            self.assertNotIn('hotwords', kwargs)
            return iter([SimpleNamespace(text=' 3.', no_speech_prob=.08, avg_logprob=-.58)]), None
        engine.word_model = SimpleNamespace(transcribe=recognize)
        self.assertEqual(engine.transcribe(None), 'three')
        self.assertEqual(engine.raw_transcript, '3.')


if __name__ == '__main__':
    unittest.main()
