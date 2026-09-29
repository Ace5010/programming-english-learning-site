import test from 'node:test';
import assert from 'node:assert/strict';
import { phonemes, phonemeAudioURL, phonemeAudioPath } from '../src/phonemeInventory.ts';
import { verifyPhonemicAssets } from '../scripts/verify-phonemic-assets.mjs';

test('the traditional British inventory covers each target once and comparisons resolve', () => {
  const expected = {
    vowels: 'iː ɪ ʊ uː e ə ɜː ɔː æ ʌ ɑː ɒ',
    diphthongs: 'eɪ aɪ ɔɪ əʊ aʊ ɪə eə ʊə',
    consonants: 'p b t d k g tʃ dʒ f v θ ð s z ʃ ʒ m n ŋ h l r w j',
  };
  assert.equal(new Set(phonemes.map(p => p.id)).size, 44);
  assert.equal(new Set(phonemes.map(p => p.ipa)).size, 44);
  for (const [group, symbols] of Object.entries(expected)) assert.deepEqual(new Set(phonemes.filter(p => p.group === group).map(p => p.ipa)), new Set(symbols.split(' ')));
  for (const item of phonemes) {
    assert.ok(item.instruction && item.meaning && item.word);
    if (item.compare) assert.ok(phonemes.some(p => p.id === item.compare && p.id !== item.id));
    for (const kind of ['sound', 'word']) assert.match(phonemeAudioURL(item.id, kind), /^https:\/\/dictionary\.cambridge\.org\/media\/english\/uk_phonetic\/uk_phonetics_(sound|word)_[a-z0-9_]+\.mp3$/);
    assert.notEqual(phonemeAudioURL(item.id, 'sound'), phonemeAudioURL(item.id, 'word'));
  }
  assert.throws(() => phonemeAudioURL('missing', 'sound'));
});

test('day vowel and consonant map to different source recordings; j is not the letter J', () => {
  assert.equal(phonemeAudioURL('ay', 'sound'), 'https://dictionary.cambridge.org/media/english/uk_phonetic/uk_phonetics_sound_day_2023feb_002.mp3');
  assert.equal(phonemeAudioURL('d', 'sound'), 'https://dictionary.cambridge.org/media/english/uk_phonetic/uk_phonetics_sound_day_2023feb_001.mp3');
  assert.equal(phonemes.find(p => p.ipa === 'j').word, 'yes');
  assert.equal(phonemes.find(p => p.ipa === 'dʒ').word, 'jump');
});

test('all local recordings match their source metadata and support relative deployment bases', () => {
  assert.equal(verifyPhonemicAssets().recordings, 88);
  for (const item of phonemes) for (const kind of ['sound', 'word']) {
    const path = phonemeAudioPath(item.id, kind);
    assert.ok(path.startsWith('audio/phonemes/uk/'));
    assert.equal(new URL(path, 'https://example.test/codewords/').pathname, `/codewords/${path}`);
    assert.equal(new URL(path, 'https://appassets.androidplatform.net/assets/').hostname, 'appassets.androidplatform.net');
  }
});
