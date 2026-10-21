import type { DailyPhrase } from './dailyCourse.ts';

export type DailyWord = DailyPhrase & { phonetic: string; contexts: string[]; chunk?: string };
type WordRow = [string, string, string, string, string, string, string];
// Authored in teaching order. Examples introduce meaning without testing unseen words.
const groups: { title: string; expressions: string[]; rows: WordRow[] }[] = [
  { title: '我和你', expressions: ['hello', 'goodbye'], rows: [
    ['I', '我', 'aɪ', 'I am Ben.', '我叫 Ben。', 'I am Mia.', '我叫 Mia。'],
    ['you', '你；你们', 'juː', 'You are Ben.', '你是 Ben。', 'You are Mia.', '你是 Mia。'],
    ['am', '是（与 I 连用）', 'æm', 'I am Ben.', '我叫 Ben。', 'I am Mia.', '我叫 Mia。'],
    ['are', '是（与 you 等连用）', 'ɑːr', 'You are Ben.', '你是 Ben。', 'Are you Mia?', '你是 Mia 吗？'],
    ['is', '是（与单数的人或物连用）', 'ɪz', 'Ben is a student.', 'Ben 是一名学生。', 'Mia is a teacher.', 'Mia 是一名老师。'],
    ['a', '一个；一名', 'ə', 'I am a student.', '我是一名学生。', 'You are a teacher.', '你是一名老师。'],
  ] },
  { title: '姓名与身份', expressions: ['whats-your-name', 'are-you-mia'], rows: [
    ['he', '他', 'hiː', 'He is Ben.', '他是 Ben。', 'He is a teacher.', '他是一名老师。'],
    ['she', '她', 'ʃiː', 'She is Mia.', '她是 Mia。', 'She is a student.', '她是一名学生。'],
    ['my', '我的', 'maɪ', 'My name is Ben.', '我的名字是 Ben。', 'My name is Mia.', '我的名字是 Mia。'],
    ['name', '名字', 'neɪm', 'My name is Ben.', '我的名字是 Ben。', 'My name is Mia.', '我的名字是 Mia。'],
    ['student', '学生', 'ˈstuːdənt', 'I am a student.', '我是一名学生。', 'She is a student.', '她是一名学生。'],
    ['teacher', '老师', 'ˈtiːtʃər', 'I am a teacher.', '我是一名老师。', 'He is a teacher.', '他是一名老师。'],
  ] },
  { title: '心情与状态', expressions: ['daily-expression-how-are-you', 'daily-expression-fine-thanks'], rows: [
    ['happy', '高兴的', 'ˈhæpi', 'I am happy.', '我很高兴。', 'She is happy.', '她很高兴。'],
    ['tired', '累的', 'ˈtaɪərd', 'I am tired.', '我累了。', 'He is tired.', '他累了。'],
    ['good', '好的', 'ɡʊd', 'I am a good student.', '我是一名好学生。', 'She is a good teacher.', '她是一名好老师。'],
    ['sad', '难过的', 'sæd', 'I am sad.', '我很难过。', 'She is sad.', '她很难过。'],
    ['fine', '身体好；状态不错', 'faɪn', 'I am fine.', '我很好。', 'He is fine.', '他很好。'],
    ['not', '不；不是', 'nɑːt', 'I am not tired.', '我不累。', 'She is not sad.', '她不难过。'],
  ] },
  { title: '国家与来源', expressions: ['are-you-from-china', 'no-im-not'], rows: [
    ['from', '来自', 'frəm', 'I am from China.', '我来自中国。', 'She is from Japan.', '她来自日本。'],
    ['where', '哪里', 'wer', 'Where are you from?', '你来自哪里？', 'Where is Mia?', 'Mia 在哪里？'],
    ['China', '中国', 'ˈtʃaɪnə', 'I am from China.', '我来自中国。', 'He is from China.', '他来自中国。'],
    ['Japan', '日本', 'dʒəˈpæn', 'I am from Japan.', '我来自日本。', 'She is from Japan.', '她来自日本。'],
    ['Chinese', '中国人；中国的；中文', 'ˌtʃaɪˈniːz', 'I am Chinese.', '我是中国人。', 'He is Chinese.', '他是中国人。'],
    ['Japanese', '日本人；日本的；日语', 'ˌdʒæpəˈniːz', 'I am Japanese.', '我是日本人。', 'She is Japanese.', '她是日本人。'],
  ] },
  { title: '家与学校', expressions: [], rows: [
    ['here', '这里', 'hɪr', 'I am here.', '我在这里。', 'She is here.', '她在这里。'],
    ['there', '那里', 'ðer', 'I am there.', '我在那里。', 'He is there.', '他在那里。'],
    ['home', '家；在家；回家', 'hoʊm', 'I am home.', '我在家。', 'She is at home.', '她在家。'],
    ['school', '学校', 'skuːl', 'I am at school.', '我在学校。', 'He is at school.', '他在学校。'],
    ['at', '在（某个地点）', 'æt', 'I am at home.', '我在家。', 'She is at school.', '她在学校。'],
    ['in', '在……里', 'ɪn', 'I am in China.', '我在中国。', 'He is in Japan.', '他在日本。'],
  ] },
  { title: '去哪里与做什么', expressions: [], rows: [
    ['go', '去', 'ɡoʊ', 'I go home.', '我回家。', 'I go to school.', '我去上学。'],
    ['come', '来', 'kʌm', 'Come here.', '来这里。', 'Come home.', '回家来。'],
    ['live', '居住；生活', 'lɪv', 'I live in China.', '我住在中国。', 'I live in Japan.', '我住在日本。'],
    ['work', '工作', 'wɜːrk', 'I work at home.', '我在家工作。', 'I work here.', '我在这里工作。'],
    ['to', '到；向', 'tuː', 'I go to school.', '我去上学。', 'I go to Japan.', '我去日本。'],
    ['like', '喜欢', 'laɪk', 'I like school.', '我喜欢学校。', 'I like China.', '我喜欢中国。'],
  ] },
  { title: '家人', expressions: [], rows: [
    ['family', '家人；家庭', 'ˈfæməli', 'My family is here.', '我的家人在这里。', 'My family is at home.', '我的家人在家。'],
    ['mother', '母亲；妈妈', 'ˈmʌðər', 'She is my mother.', '她是我的妈妈。', 'My mother is at home.', '我的妈妈在家。'],
    ['father', '父亲；爸爸', 'ˈfɑːðər', 'He is my father.', '他是我的爸爸。', 'My father is here.', '我的爸爸在这里。'],
    ['brother', '兄；弟', 'ˈbrʌðər', 'He is my brother.', '他是我的兄弟。', 'My brother is a student.', '我的兄弟是一名学生。'],
    ['sister', '姐；妹', 'ˈsɪstər', 'She is my sister.', '她是我的姐妹。', 'My sister is a teacher.', '我的姐妹是一名老师。'],
    ['friend', '朋友', 'frend', 'He is my friend.', '他是我的朋友。', 'My friend is here.', '我的朋友在这里。'],
  ] },
  { title: '身边的人', expressions: [], rows: [
    ['man', '成年男子', 'mæn', 'He is a man.', '他是一名成年男子。', 'My father is a good man.', '我的爸爸是个好人。'],
    ['woman', '成年女子', 'ˈwʊmən', 'She is a woman.', '她是一名成年女子。', 'My mother is a good woman.', '我的妈妈是个好人。'],
    ['child', '孩子', 'tʃaɪld', 'I am a child.', '我是一个孩子。', 'My child is at school.', '我的孩子在学校。'],
    ['boy', '男孩', 'bɔɪ', 'He is a boy.', '他是一个男孩。', 'My brother is a boy.', '我的弟弟是一个男孩。'],
    ['girl', '女孩', 'ɡɜːrl', 'She is a girl.', '她是一个女孩。', 'My sister is a girl.', '我的妹妹是一个女孩。'],
    ['we', '我们', 'wiː', 'We are at home.', '我们在家。', 'We are from China.', '我们来自中国。'],
  ] },
  { title: '日常动作', expressions: ['daily-expression-thank-you', 'daily-expression-come-in'], rows: [
    ['eat', '吃', 'iːt', 'I eat at home.', '我在家吃饭。', 'I eat at school.', '我在学校吃饭。'],
    ['drink', '喝', 'drɪŋk', 'I drink water.', '我喝水。', 'I drink milk.', '我喝牛奶。'],
    ['read', '读；阅读', 'riːd', 'I read at home.', '我在家阅读。', 'I read at school.', '我在学校阅读。'],
    ['write', '写', 'raɪt', 'I write at home.', '我在家写字。', 'I write at school.', '我在学校写字。'],
    ['see', '看见', 'siː', 'I see you.', '我看见你了。', 'I see my mother.', '我看见我的妈妈了。'],
    ['want', '想要', 'wɑːnt', 'I want a book.', '我想要一本书。', 'I want water.', '我想要水。'],
  ] },
  { title: '随身物品', expressions: ['what-is-it', 'it-is-a-book'], rows: [
    ['book', '书', 'bʊk', 'I read a book.', '我读一本书。', 'I want a book.', '我想要一本书。'],
    ['pen', '笔', 'pen', 'I want a pen.', '我想要一支笔。', 'My pen is here.', '我的笔在这里。'],
    ['bag', '包', 'bæɡ', 'My bag is here.', '我的包在这里。', 'I want a bag.', '我想要一个包。'],
    ['cup', '杯子', 'kʌp', 'I want a cup.', '我想要一个杯子。', 'My cup is here.', '我的杯子在这里。'],
    ['key', '钥匙', 'kiː', 'My key is here.', '我的钥匙在这里。', 'I want my key.', '我想要我的钥匙。'],
    ['phone', '电话；手机', 'foʊn', 'My phone is here.', '我的手机在这里。', 'I want a phone.', '我想要一部手机。'],
  ] },
  { title: '食物与饮品', expressions: [], rows: [
    ['apple', '苹果', 'ˈæpəl', 'I eat an apple.', '我吃一个苹果。', 'I want an apple.', '我想要一个苹果。'],
    ['egg', '鸡蛋', 'eɡ', 'I eat an egg.', '我吃一个鸡蛋。', 'I want an egg.', '我想要一个鸡蛋。'],
    ['water', '水', 'ˈwɔːtər', 'I drink water.', '我喝水。', 'I want water.', '我想要水。'],
    ['milk', '牛奶', 'mɪlk', 'I drink milk.', '我喝牛奶。', 'I want milk.', '我想要牛奶。'],
    ['bread', '面包', 'bred', 'I eat bread.', '我吃面包。', 'I want bread.', '我想要面包。'],
    ['rice', '米饭；稻米', 'raɪs', 'I eat rice.', '我吃米饭。', 'I want rice.', '我想要米饭。'],
  ] },
  { title: '指认物品', expressions: ['what-is-this', 'is-that-a-bag'], rows: [
    ['this', '这；这个', 'ðɪs', 'This is a book.', '这是一本书。', 'This is my pen.', '这是我的笔。'],
    ['that', '那；那个', 'ðæt', 'That is a bag.', '那是一个包。', 'That is my phone.', '那是我的手机。'],
    ['it', '它', 'ɪt', 'It is a book.', '它是一本书。', 'It is my key.', '它是我的钥匙。'],
    ['these', '这些', 'ðiːz', 'These are books.', '这些是书。', 'These are my pens.', '这些是我的笔。'],
    ['those', '那些', 'ðoʊz', 'Those are bags.', '那些是包。', 'Those are my cups.', '那些是我的杯子。'],
    ['an', '一个（用于元音音素前）', 'ən', 'I want an apple.', '我想要一个苹果。', 'I eat an egg.', '我吃一个鸡蛋。'],
  ] },
];

export const dailyVocabularyGroups = groups.map((group, index) => ({
  id: `DV1-${String(Math.floor(index / 3) + 1).padStart(2, '0')}-${String(index % 3 + 1).padStart(2, '0')}`,
  title: group.title, expressions: group.expressions,
  words: group.rows.map(([en, zh, phonetic, en1, zh1, en2, zh2]) => {
    const id = `daily-word-${en.toLowerCase()}`;
    const examples = [{ id: `${id}-example-1`, en: en1, zh: zh1 }, { id: `${id}-example-2`, en: en2, zh: zh2 }];
    return { id, en, zh, phonetic, contexts: examples.map(item => item.id), examples,
      ...(en === 'live' ? { pronunciationContext: { text: 'I live here.', targetIndex: 1 }, audioRevision: 'verb-v1' } : {}) };
  }),
}));
export const dailyVocabularyWords = dailyVocabularyGroups.flatMap(group => group.words);
export const dailyVocabularyExamples = dailyVocabularyWords.flatMap(word => word.examples);
const expressionsByTheme: Record<string, [string, string][]> = {
  '家与学校': [['Where is your school?', '你的学校在哪里？'], ['I am at home now.', '我现在在家。']],
  '去哪里与做什么': [['Come here, please.', '请到这里来。'], ['I want to go home.', '我想回家。']],
  '家人': [['This is my family.', '这是我的家人。'], ['My mother is a teacher.', '我的妈妈是一名老师。']],
  '身边的人': [['Who is that boy?', '那个男孩是谁？'], ['We are friends.', '我们是朋友。']],
  '食物与饮品': [['Water, please.', '请给我水。'], ['An apple, please.', '请给我一个苹果。']],
};
export const dailyVocabularyExpressions = [
  { id: 'daily-expression-thank-you', en: 'Thank you.', zh: '谢谢你。' },
  { id: 'daily-expression-come-in', en: 'Come in, please.', zh: '请进。' },
  { id: 'daily-expression-how-are-you', en: 'How are you?', zh: '你好吗？' },
  { id: 'daily-expression-fine-thanks', en: 'I am fine, thank you.', zh: '我很好，谢谢你。' },
  ...dailyVocabularyGroups.flatMap(group => group.expressions.length ? []
    : expressionsByTheme[group.title].map(([en, zh], index) => ({ en, zh, id: `daily-expression-${group.id.toLowerCase()}-${index + 1}` }))),
];
export function dailyStudyInfo(id: string, introduced?: Set<string>) {
  const word = dailyVocabularyWords.find(word => word.id === id);
  if (!word) return undefined;
  const groupIndex = dailyVocabularyGroups.findIndex(group => group.words.some(word => word.id === id));
  const taught = new Set((introduced ? dailyVocabularyWords.filter(word => introduced.has(word.id))
    : dailyVocabularyGroups.slice(0, groupIndex + 1).flatMap(group => group.words)).map(word => word.en.toLowerCase()));
  const supportWords = [...new Set(word.examples[0].en.match(/[A-Za-z]+/g) ?? [])]
    .filter(en => !taught.has(en.toLowerCase()) && !['Ben', 'Mia'].includes(en))
    .flatMap(en => { const found = dailyVocabularyWords.find(item => item.en.toLowerCase() === en.toLowerCase()); return found ? [found] : []; });
  return { phonetic: word.phonetic, usage: '', supportWords };
}
