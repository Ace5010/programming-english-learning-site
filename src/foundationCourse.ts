import type { DailyPhrase, DailyUnit } from './dailyCourse';
import type { LearningExercise, LearningLesson } from './learningTypes';
import { foundationTutorials, type FoundationTutorial } from './foundationTutorials.ts';

export const FOUNDATION_KEY = 'codewords-foundation-v1';
export const foundationSources = {
  grammar: { name: 'British Council 入门语法目录', url: 'https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2' },
  sounds: { name: 'Cambridge 音标与重音说明', url: 'https://dictionary.cambridge.org/help/phonetics.html' },
  connected: { name: 'British Council 连贯语音教学', url: 'https://www.teachingenglish.org.uk/professional-development/teachers/knowing-subject/connected-speech-part-1' },
  handwriting: { name: 'Oxford Owl 字母书写与字形指导', url: 'https://home.oxfordowl.co.uk/english/primary-handwriting/' },
};
type Example = [en: string, zh: string, note: string];
type Check = [prompt: string, answer: string, distractor: string, explanation: string];
export interface FoundationTopic {
  id: string; title: string; group: string; explanation: string[]; examples: DailyPhrase[];
  checks: Check[]; sound: boolean; source: keyof typeof foundationSources;
  prerequisiteIds: string[];
  referenceOnly?: boolean;
  /** Removed from the product; definitions stay only to read historical records. */
  hidden?: boolean;
}
export const foundationTopics: FoundationTopic[] = [];
function topic(id: string, group: string, title: string, explanation: string[], examples: Example[], checks: Check[], sound = false, source: keyof typeof foundationSources = 'grammar') {
  foundationTopics.push({ id: `foundation-${id}`, group, title, explanation, checks, sound, source,
    prerequisiteIds: foundationTopics.length ? [foundationTopics[foundationTopics.length - 1].id] : [],
    examples: examples.map(([en, zh, note], index) => ({ id: `foundation-${id}-${index + 1}`, en, zh, note })) });
}

topic('word-concepts', '单词和句子', '单词、词组和句子有什么区别', [
  '单词表达一个基本意思。例如 cup 是杯子，red 是红色的。几个词组合起来，可以把意思说得更具体：a red cup 表示“一个红色的杯子”，这样的组合叫词组。',
  '词组可以说明一个人或东西，还不一定是一句完整的话。I drink water. 表达“我喝水”：I 说明是谁，drink 说明做什么，water 说明喝什么。读句子时先看这些词各自起什么作用。',
  '语法帮助我们把这些词组织起来，包括词放在哪里、什么时候需要改变形式。先从短句理解，再逐步认识名词、动词和语序，不必先背一大串名称。',
], [['a red cup', '一个红色的杯子', '这是一个词组；cup 说是什么东西，red 说明它的颜色。'], ['I drink water.', '我喝水。', '这句话说明谁做什么：I 是我，drink 是喝，water 是水。']], [
  ['a red cup 在这里说明什么？', '一个什么样的东西', '某个人做了什么动作', '这个词组指一个红色的杯子，还没有说它怎么样或发生了什么。'],
  ['I drink water. 中，哪个词说明做什么？', 'drink', 'I', 'I 说明是谁，drink 说明喝这个动作，water 说明喝什么。'],
]);
// Historical content below remains parseable but is hidden from every page.
topic('handwriting', '字母的实际用法', '字母认识了，手写怎么写', [
  '从普通、不连笔的手写开始。看清楚从哪里落笔、往哪边走、哪里抬笔，以及字母放在线的哪里。下面可以逐笔看大小写字母，先试 a 和 g，再查其他不会写的字母。',
  '印刷体和手写体可以长得不同。这里的小写 a 和 g 都用单层的手写字形；g 的尾部伸到基线下方，a 的底部落在基线上。b 的长竖在左边，d 的长竖在右边，别写反。',
  '示范是一套便于练习的普通写法，不是唯一规定的笔顺。拿纸笔跟着写，再对照轮廓、相对高度和间距；观看和选择题只帮助理解，不能代替亲手写。',
], [['A', '字母 A 的名称', '选择小写 a，可以比较常见印刷字形与手写字形。'], ['G', '字母 G 的名称', '选择小写 g，看它的尾部怎样伸到基线下方。']], [
  ['在这套手写示范里，小写 g 的尾部放在哪里？', '伸到基线下方', '整字都放在基线上方', 'g 的圆肚子在中间，尾部伸到基线下方；a 不需要这样的下伸尾部。'],
  ['手写小写 b 和 d，长竖的位置怎样区分？', 'b 在左，d 在右', 'b 在右，d 在左', '对照示范的轮廓：b 左边是长竖，d 右边是长竖。'],
  ['看到印刷体 a、g 与示范不一样，应怎样理解？', '同一个字母可以有不同字形', '手写也必须描出印刷体的每个细节', '日常手写可以采用较简洁的单层字形，仍是同一个字母。'],
], false, 'handwriting');
topic('writing-conventions', '句子怎么组成', '句子里的大写、空格和标点', [
  '普通句子的第一个字母大写；表示“我”的 I 无论在句首还是句中都大写。人名、地名等专有名称通常也要大写，但不要把每个单词的开头都变成大写。',
  '英文单词之间留空格，单词内部不要把每个字母隔开。句号、逗号、问号通常紧贴前一个词；后面接新词时再留空格。英文句号是小实点。',
], [['I am happy.', '我很开心。', 'I 表示我，始终大写；am 和 happy 在这里小写。'], ['We read books.', '我们读书。', 'We 的 W 在句首大写；三个单词用空格分开，句号紧跟 books。']], [
  ['表示“我”的 I 放到句子中间时，怎样写？', '仍然大写', '改成小写 i', 'I 这个代词始终大写，不只在句首。'],
  ['We read books. 中，空格和句号怎样安排？', '词间留空格，句号紧跟最后一个词', '每个字母间留空格，句号前也留空格', '留空格是为了区分单词；句号紧贴前面的词。'],
]);
topic('letters', '概念备查', '字母是什么', [
  '英语常用 26 个字母。每个字母有大写和小写两种样子，例如 A 和 a 是同一个字母。字母有名称，可以把名称读出来。',
  '先认识字母的样子，再把字母连成单词。下方可以逐个听字母名称；后面会另教字母在单词里的声音。',
], [['A', '字母 A 的名称', '小写是 a。'], ['B', '字母 B 的名称', '小写是 b。']], [
  ['A 和 a 是什么关系？', '同一个字母的大写和小写', '两个完全不同的字母', '大小写改变字母的样子，A 和 a 仍是同一个字母。'],
  ['看到 B 和 b，应该怎样理解？', '它们是同一个字母', '小写 b 是一个完整句子', 'B 是大写，b 是小写；单独一个字母通常还没有组成句子。'],
]);
topic('words', '概念备查', '字母怎样组成单词', [
  '单词是表达意思的基本单位。cat 由 c、a、t 三个字母按顺序组成，意思是“猫”。字母顺序也是单词的一部分。',
  '多个单词写在一起时，通常用空格分开。a cat 有两个单词，表达“一只猫”；不要把空格当成某个字母。',
], [['cat', '猫', '三个字母组成一个单词。'], ['a cat', '一只猫', 'a 和 cat 之间有一个空格。']], [
  ['cat 里有几个字母？', '三个字母', '一个字母', 'c、a、t 是三个字母，它们合起来是一个单词。'],
  ['a cat 里有几个单词？', '两个单词', '四个单词', '空格把 a 和 cat 分开。字母数和单词数是两回事。'],
]);
topic('sentence', '概念备查', '什么是一句话', [
  '句子把一个意思说出来。I 表示“我”，run 表示“跑”；I run. 表达“我跑步”。先从这种很短的句子开始。',
  '普通陈述句末尾常用句号，提问常用问号。句子第一个字母通常大写；表示“我”的 I 单独使用时总是大写。',
], [['I run.', '我跑步。', 'I 是谁，run 是做什么。'], ['I sit.', '我坐着。', 'sit 表示“坐”；句末的点是句号。']], [
  ['表示“我”的单词应该怎样写？', '大写 I', '小写 l', 'I 是英语的“我”；小写 l 是另一个字母。'],
  ['普通陈述句结束时，常用哪个符号？', '句号 .', '问号 ?', '句号表示这句陈述结束，问号用于提问。'],
]);
topic('letter-sound', '音标与发音', '音标是什么，怎样帮助读词', [
  '音标用符号记录单词的读音，通常写在两条斜线之间。看到不熟悉的词，可以把音标和录音一起看，逐步知道嘴里发的是哪些声音。',
  '不能只看拼写就认定读音总是一样。例如 cat 和 cake 都有 a，但这里分别包含 /æ/ 和 /eɪ/。先听下面两个词，再把听到的声音与音标对应起来。',
], [['cat', '猫', '这里 a 的音标是 /æ/，嘴张开，舌头靠前。'], ['cake', '蛋糕', '这里 a 的声音是 /eɪ/，有一个滑动过程。']], [
  ['字母 a 在所有单词里都发同一个音吗？', '可能发不同的音', '永远只有一个音', 'cat 和 cake 中 a 的声音不同，不能只背字母名称来读所有单词。'],
  ['音标主要帮助我们了解什么？', '单词怎样发音', '单词一定有几个字母', '音标记录声音；字母拼写与声音不是逐个固定对应。'],
], true, 'sounds');
topic('nouns', '句子怎么组成', '表示人和东西的词', [
  'cat 表示猫，book 表示书。这类给人、动物、东西或地点命名的词，叫名词。以后还会见到表示想法等抽象事物的名词。',
  '先问“这个词在说什么人或东西”。这一课只认识名词的作用，不需要一次记住全部分类。',
], [['a book', '一本书', 'book 是书；a book 放在一起表示一本书。'], ['a dog', '一只狗', 'dog 是狗。']], [
  ['book 表示“书”，这里是什么词？', '名词：给东西命名', '动词：表示一个动作', '这里 book 是东西的名称，属于名词。'],
  ['dog 表示“狗”，它在这里做什么？', '说出一种动物的名称', '说明今天的时间', '给动物命名也是名词的常见作用。'],
]);
topic('verbs', '句子怎么组成', '表示动作的词', [
  'run 是跑，sit 是坐。这类表示动作的词叫动词。动词还可以表示状态或关系，后面会学到。',
  '在 I run. 中，I 说明是谁，run 说明做什么。先找出动作，可以帮助我们读懂简单句子。',
], [['I run.', '我跑步。', 'run 表示跑这个动作。'], ['I sit.', '我坐着。', 'sit 表示坐这个动作。']], [
  ['I run. 中哪个词说明动作？', 'run', 'I', 'I 表示我，run 才是跑这个动作。'],
  ['I sit. 中 sit 的作用是什么？', '说明做什么', '说明谁在做', 'sit 表示坐；说明谁在做的是 I。'],
]);
topic('adjectives', '句子怎么组成', '描述样子的词', [
  'red 是红色的，big 是大的。用来描述人或东西的性质、样子或状态的词，叫形容词。',
  '在 a red cup 中，cup 是杯子，red 告诉我们杯子是什么颜色。先把 a red cup 看作一个完整的小词组。',
], [['a red cup', '一个红色的杯子', 'red 描述 cup 的颜色。'], ['a big cup', '一个大杯子', 'big 描述 cup 的大小。']], [
  ['a red cup 中，哪个词描述颜色？', 'red', 'cup', 'cup 是东西的名称，red 描述它的颜色。'],
  ['big 表示“大”，这里属于哪一类词？', '描述样子的形容词', '表示人的代词', 'big 描述大小；代词会在后面专门学习。'],
]);
topic('pronouns', '句子怎么组成', '我、你、他怎样说', [
  'I 是我，you 是你或你们，he 是他，she 是她，it 常指一个东西或动物，we 是我们，they 是他们、她们或它们。这样的词叫代词。',
  '代词能代替反复提到的名称。先根据实际要说的人或东西选择，不凭一个名字猜测对方应该用哪个代词。',
], [['We run.', '我们跑步。', 'we 指包括说话人在内的我们。'], ['They run.', '他们跑步。', '这里 they 指前面谈到的那些人。']], [
  ['“我们”应该选哪个词？', 'we', 'they', 'we 包括说话人，they 指他们、她们或它们。'],
  ['you 可以表示什么？', '你，也可以表示你们', '只能表示我', 'you 的单复数形式相同，具体意思要看情境。'],
]);
topic('word-order', '句子怎么组成', '句子语序：谁、做什么、对什么', [
  'I drink water. 是“我喝水”。I 说明谁，drink 说明做什么，water 说明喝的是什么。这里的顺序是：谁 → 动作 → 动作涉及的东西。',
  '这三个部分在这里分别叫主语、谓语和宾语。它们是句中角色；名词、动词则是词的种类。英语也有其他句型，不能给每句话都硬加一个宾语。',
], [['I drink water.', '我喝水。', 'I：我；drink：喝；water：水。'], ['We read books.', '我们读书。', 'We：我们；read：读；books：书。']], [
  ['I drink water. 中，喝的是什么？', 'water', 'I', 'water 是动作 drink 涉及的东西，在这里是宾语。'],
  ['We read books. 中，谁在读？', 'We', 'books', 'We 表示我们，是句中说明谁在做动作的主语。'],
]);
topic('be', '句子怎么组成', '为什么需要 am、is、are', [
  '“我很开心”描述状态，英语说 I am happy.。am 把“我”和“开心”连接起来。在这样的完整陈述句里，要保留它。',
  'am、is、are 都是 be 的现在形式。先认识 I am、you/we/they are、he/she/it is。它们不总是逐字翻译成“是”。',
], [['I am happy.', '我很开心。', 'I 后面用 am，happy 表示开心。'], ['You are happy.', '你很开心。', 'you 后面用 are。']], [
  ['I ___ happy. 中应该填什么？', 'am', 'are', '表示“我”的 I 在这里与 am 搭配。'],
  ['You ___ happy. 中应该填什么？', 'are', 'am', '表示“你”的 you 在这里与 are 搭配。'],
]);
topic('roles', '句子怎么组成', 'I、me、my 的区别', [
  'I 用在“我做什么”的位置。me 用在动作或介词后面表示“我”。my 放在东西名称前面表示“我的”。',
  '它们都与我有关，但位置和作用不同。先比较 I like tea. 和 Help me.，再把 my book 当作“我的书”这个整体来记。',
], [['I like tea.', '我喜欢茶。', 'I 是谁；like 是喜欢；tea 是茶。'], ['Help me.', '帮帮我。', 'help 是帮助；动作后面用 me。']], [
  ['表示“我的书”，应选哪一组？', 'my book', 'me book', 'my 表示“我的”，放在 book 前面。'],
  ['Help ___ . 表示“帮帮我”，应填什么？', 'me', 'I', '这里我接受帮助，放在 help 后面，用 me。'],
]);
topic('articles', '小词与词形', 'a 和 an 放在什么地方', [
  '说到一个能数清的东西，可以用 a 或 an 加它的名称，例如 a cup（一只杯子）。这类放在名词前的小词叫冠词。',
  'a 和 an 的选择看后面的第一个声音：辅音前常用 a，元音前用 an。元音是发音时气流较通畅的声音；辅音会在嘴或喉部受到阻碍。以后会逐个练习。',
], [['a cup', '一只杯子', 'cup 开头的 /k/ 是辅音，用 a。'], ['an egg', '一个鸡蛋', 'egg 开头的 /e/ 是元音，用 an。']], [
  ['说“一个鸡蛋”，应选哪一组？', 'an egg', 'a egg', 'egg 开头是元音，所以用 an。'],
  ['a 和 an 主要依据什么选择？', '后面的第一个声音', '单词有几个字母', '判断的是声音，不能只数单词字母。'],
]);
topic('plural', '小词与词形', '一个和多个为什么写法不同', [
  '一个叫单数，不止一个叫复数。很多名词变复数时加 s：book 是书，books 表示多本书。',
  'one 是一，two 是二。two 后面表示可数东西时要用复数。也有不按加 s 变化的词，遇到时会单独说明。',
], [['one book', '一本书', '只有一本，book 保持单数。'], ['two books', '两本书', '有两本，book 后面加 s。']], [
  ['“两本书”应该怎样说？', 'two books', 'two book', 'two 表示两个，book 在这里用复数 books。'],
  ['所有名词的复数都只加 s 吗？', '有些词会有其他变化', '所有词都只加 s', '加 s 是常见规律，不能替代每个词的实际复数形式。'],
]);
topic('countable', '小词与词形', '为什么水不能直接加 a', [
  'book 可以一本一本数，是可数名词。water 通常作为水这种物质来表达，是不可数名词。这里的“不可数”说的是英语表达方式。',
  '要说明水的数量，可以数容器：a cup of water 是一杯水。cup 表示杯，of 把容器和里面的东西连起来。',
], [['a cup of water', '一杯水', '数的是杯，water 保持原样。'], ['two cups of water', '两杯水', 'cups 变成复数，water 不变。']], [
  ['表示“两杯水”，哪个词变复数？', 'cup 变成 cups', 'water 变成 waters', '这里数的是杯子，所以 cups 变复数。'],
  ['“一杯水”怎么表达？', 'a cup of water', 'a water cup of', '把 a cup of 看作“一杯……”的结构，后面接 water。'],
]);
topic('the', '小词与词形', 'a 和 the 有什么不同', [
  'a book 常用来引入“一本书”，还没说明具体是哪本。the book 用在双方能认出你说的是哪本书时。',
  '例如先说 I have a book.（我有一本书），接着说 The book is red.（这本书是红色的）。第二次已经知道在说哪本书。',
], [['I have a book.', '我有一本书。', 'have 是有；先介绍一本书。'], ['The book is red.', '这本书是红色的。', '这里 the 指前面刚提到的那本书。']], [
  ['接着谈刚才那本书，通常用哪一组？', 'the book', 'a books', '双方已经知道是哪本，用 the book。'],
  ['the 的作用更接近哪一种？', '帮助指出能确定的人或东西', '固定表示数量一', 'the 也能用在复数前面，核心是所指对象能被确定。'],
]);
topic('position', '小词与词形', '描述内容为什么有的在前有的在后', [
  'a red cup 中，red 是描述颜色的形容词，放在 cup 前。the cup on the table 中，on the table 是说明位置的一组词，放在 cup 后。',
  '比较的是两种不同结构。先看中心说的东西是什么，再看前后内容补充了什么；不要把中文逐字搬过去。',
], [['a red cup', '一个红色的杯子', '先描述红色，再说杯子。'], ['the cup on the table', '桌子上的那个杯子', '先说杯子，再补充它在桌子上。']], [
  ['a red cup 中 red 放在哪里？', 'cup 前面', 'a 前面', '这里用 a + 描述颜色的词 + 东西名称。'],
  ['the cup on the table 中，哪部分说明位置？', 'on the table', 'the cup', 'on the table 表示在桌子上，补充杯子的位置。'],
]);
topic('place', '小词与词形', 'in、on、at 怎样说明位置', [
  'in 常说明在一个空间里面；on 常说明接触着表面；at 常把地点当作一个活动点。它们叫介词，后面通常接要说明的地方。',
  '先用具体物品理解：in the box 是在盒子里，on the box 是在盒子上。at home 是在家，作为常用搭配一起认识。',
], [['in the box', '在盒子里面', 'in 说明在内部。'], ['on the box', '在盒子上面', 'on 说明接触盒子的上表面。']], [
  ['猫在盒子内部，应该选什么？', 'in the box', 'on the box', '内部用 in；on 在这里表示上表面。'],
  ['盒子上放着一本书，说明书的位置应选什么？', 'on the box', 'in the box', '书接触盒子上表面，在这里用 on。'],
]);
topic('possessive', '小词与词形', '怎样表示是谁的', [
  'my book 是我的书，your book 是你的书。my 和 your 放在名词前面，说明东西属于谁。',
  '用人的名称说明所属时，常在后面加撇号和 s：Ben’s book 是 Ben 的书。这里的 s 不表示书有好几本。',
], [["Ben's book", 'Ben 的书', '撇号加 s 说明属于 Ben。'], ['my book', '我的书', 'my 后面直接接 book。']], [
  ['Ben’s book 中，撇号加 s 说明什么？', '书属于 Ben', '书有好几本', '所有关系和名词复数是不同的用法。'],
  ['表示“你的书”，应选什么？', 'your book', 'you book', '这里需要表示“你的”的 your。'],
]);
topic('there', '句子怎么组成', '有一只猫，和我有一只猫', [
  'There is a cat. 表示“有一只猫”，先说某个东西存在。I have a cat. 表示“我有一只猫”，说明我拥有它。',
  'there is 后面先学单数；说多个时用 there are。这里 there 不必逐字翻译成“那里”。',
], [['There is a cat.', '有一只猫。', '介绍猫的存在。'], ['I have a cat.', '我有一只猫。', '说明我拥有一只猫。']], [
  ['“我有一只猫”应该用哪句？', 'I have a cat.', 'There is a cat.', '要表达我拥有它，用 I have。'],
  ['介绍“有两只猫”，应选择哪个开头？', 'There are', 'There is', '两只猫是复数，使用 there are。'],
]);
topic('present', '表达与变化', '经常做的事怎样说', [
  'I drink tea. 可以表达我平时喝茶的习惯。这种谈习惯、常态等的用法叫一般现在时，不只表示此刻正在做。',
  '说 he、she、it 或一个人经常做什么时，很多动词要加 s：I like tea. 与 She likes tea.。这里只改变动作词的形式。',
], [['I like tea.', '我喜欢茶。', 'I 后面的 like 保持原样。'], ['She likes tea.', '她喜欢茶。', 'she 后面在这里用 likes。']], [
  ['She ___ tea. 应该填什么？', 'likes', 'like', '这里谈她平时喜欢什么，she 后用 likes。'],
  ['一般现在时可以用来谈什么？', '平时的习惯和常态', '只能谈正在发生的动作', '习惯和常态是一般现在时的常见用途。'],
]);
topic('be-negative', '提问和否定', '怎样说我不累', [
  'I am tired. 是我累了。在 am 后加 not，就得到 I am not tired.，表示我不累。not 表示否定。',
  '同样的结构可以用在 is、are 后面。先找到句中的 be，再把 not 放在它后面。',
], [['I am not tired.', '我不累。', 'not 紧接在 am 后面。'], ['You are not late.', '你没迟到。', 'late 是迟的，not 放在 are 后面。']], [
  ['I am tired. 要变成否定句，not 放在哪里？', 'am 后面', 'I 前面', '这类句子在 am、is 或 are 后加 not。'],
  ['You are not late. 表达什么？', '你没迟到', '你迟到了', 'not 把 late 表示的状态否定了。'],
]);
topic('do-negative', '提问和否定', '怎样说我不喜欢', [
  'I like tea. 变成“不喜欢”时说 I do not like tea.。这里 do 帮助组成否定句，不单独翻译成“做”。',
  'she、he、it 使用 does not，后面的动作词恢复原样：She does not like tea.。不要同时写 does 和 likes。',
], [['I do not like tea.', '我不喜欢茶。', 'do not 放在 like 前面。'], ['She does not like tea.', '她不喜欢茶。', 'does 后面的 like 不再加 s。']], [
  ['She does not ___ tea. 应填什么？', 'like', 'likes', 'does 已经承担这个变化，后面用 like。'],
  ['这里 do not 主要起什么作用？', '帮助把句子变成否定', '表示喜欢得更多', 'do 帮助构成句子，not 表示否定。'],
]);
topic('be-question', '提问和否定', '怎样问你累不累', [
  'You are tired. 是一句陈述。把 are 移到 you 前面，就变成 Are you tired?，表示你累吗。',
  '这种方法先用于带 am、is、are 的句子。句首大写，句末加问号；不是把所有动作词都移到前面。',
], [['Are you tired?', '你累吗？', 'are 放在 you 前面。'], ['Is she happy?', '她开心吗？', 'is 放在 she 前面。']], [
  ['You are tired. 变成问句，哪个词移到前面？', 'are', 'tired', '这类问句把 be 移到主语前面。'],
  ['Is she happy? 中，is 为什么在 she 前面？', '这句话在提问', '所有句子都必须这样排列', '这里通过 is 和 she 的顺序表达提问。'],
]);
topic('do-question', '提问和否定', '为什么有些问句用 do', [
  'You like tea. 中没有 am、is、are。询问“你喜欢茶吗”时，在前面加 Do：Do you like tea?。',
  '问她喜不喜欢时，用 Does she like tea?。does 后面仍用 like。把 do 看作帮助提问的小词。',
], [['Do you like tea?', '你喜欢茶吗？', 'Do 帮助提问，like 保持原样。'], ['Does she like tea?', '她喜欢茶吗？', 'Does 与 she 搭配，后面用 like。']], [
  ['询问“她喜欢茶吗”，哪句合适？', 'Does she like tea?', 'Is she like tea?', 'like 是这里的动作词，使用 does 帮助提问。'],
  ['Does she ___ tea? 应填什么？', 'like', 'likes', '在 does 后，动作词恢复原样。'],
]);
topic('wh', '提问和否定', '问什么、哪里和谁', [
  'what 常问什么，where 问哪里，who 问谁。把要问的信息想清楚，再选疑问词。',
  'Where is the cup? 是“杯子在哪里”。where 放在前面，后面是 is 和 the cup。先学习这些具体句型。',
], [['Where is the cup?', '杯子在哪里？', 'where 询问地点。'], ['Who is he?', '他是谁？', 'who 询问人的身份。']], [
  ['想知道一个东西在哪里，先选哪个词？', 'where', 'who', 'where 问地点；who 问人。'],
  ['Who is he? 想知道什么？', '他是谁', '他在哪里', 'who 问身份，不是地点。'],
]);
topic('can', '提问和否定', '怎样说会做什么', [
  'can 表示能够或会，后面直接接动作词：I can swim. 是我会游泳。swim 是游泳。',
  '否定可以用 cannot；提问把 can 放前面。can 后面的动作词不因为 he、she 而加 s。',
], [['I can swim.', '我会游泳。', 'can 后面接 swim。'], ['Can you swim?', '你会游泳吗？', 'can 移到 you 前面帮助提问。']], [
  ['She can ___ . 应填什么？', 'swim', 'swims', 'can 后面使用动作词的原形 swim。'],
  ['Can you swim? 在问什么？', '你会不会游泳', '你今天几点起床', 'can 在这里询问游泳的能力。'],
]);
topic('commands', '提问和否定', '为什么打开门没有写你', [
  'Open the door. 表示“打开门”。给对方指令或建议时，常直接用动作词开头，听者能知道是让自己做。',
  '这种句子叫祈使句。please 可以让请求更礼貌；Don’t 加动作词表示请不要做某事。',
], [['Open the door.', '打开门。', 'open 是打开，door 是门。'], ['Please sit down.', '请坐下。', 'please 表示请，sit down 表示坐下。']], [
  ['Open the door. 为什么没有写 you？', '指令中常省略对听者的称呼', '句子一定写错了', '这是一条给听者的指令，常直接用动作词开头。'],
  ['Please sit down. 中 please 的作用是什么？', '让请求更礼貌', '表示不要坐下', 'please 是请；表示不要需要否定结构。'],
]);
topic('contractions', '表达与变化', '撇号藏起了什么', [
  'I am 可以缩成 I’m，do not 可以缩成 don’t。缩写在日常表达里很常见，撇号提示有字母被省去了。',
  '先把缩写和完整形式配对，再听它们在句子中的声音。这里的撇号与 Ben’s book 中表示所属的用法不同。',
], [["I'm happy.", '我很开心。', 'I’m = I am。'], ["I don't like tea.", '我不喜欢茶。', 'don’t = do not。']], [
  ['I’m 的完整形式是什么？', 'I am', 'I have', 'I’m 省去了 am 里的 a。'],
  ['don’t 对应哪一组？', 'do not', 'does not', 'don’t = do not；does not 缩成 doesn’t。'],
]);
topic('present-progressive', '表达与变化', '平时做，和正在做', [
  'I read. 可以说我平时读书。I am reading. 强调现在正在读。这里用 am、is 或 are，再加动作词的 -ing 形式。',
  '把这个结构叫现在进行时。不要只加 -ing 就漏掉前面的 am、is 或 are。',
], [['I am reading.', '我正在阅读。', 'am + reading 说明正在做。'], ['She is reading.', '她正在阅读。', 'she 后面用 is，再接 reading。']], [
  ['“我正在阅读”应选哪句？', 'I am reading.', 'I reading.', '现在进行时保留 am、is 或 are。'],
  ['She ___ reading. 应填什么？', 'is', 'am', 'she 在这里与 is 搭配。'],
]);
topic('past', '表达与变化', '怎样说已经发生的事', [
  'talk 是交谈，talked 可以表示过去交谈过。很多动词用 -ed 表示过去，但也有不同变化，例如 go 变成 went。',
  'yesterday 是昨天。先用它帮助理解时间：I talked yesterday. 说的是昨天发生的事。',
], [['I talked yesterday.', '我昨天交谈过。', 'talked 表示过去的动作。'], ['I walked yesterday.', '我昨天走过路。', 'walk 是走路，walked 是过去形式。']], [
  ['yesterday 表示什么时候？', '昨天', '明天', '过去的时间词能帮助理解动作发生的时间。'],
  ['talked 中的 -ed 在这里说明什么？', '动作发生在过去', '一定正在做', '这是动词 talk 的过去形式。'],
]);
topic('past-progressive', '表达与变化', '过去某时正在做什么', [
  'I was reading. 表示我当时正在阅读。was、were 是 be 的过去形式，后面加动作词的 -ing 形式。',
  'I was reading when you called. 表示你打来电话时我正在阅读。when 是当……的时候；called 是打过电话。',
], [['I was reading.', '我当时正在阅读。', 'was + reading 说明过去正在做。'], ['You were reading.', '你当时正在阅读。', 'you 在这里与 were 搭配。']], [
  ['I was reading. 强调什么？', '过去某时正在阅读', '明天才开始阅读', 'was 把时间放在过去，reading 表示当时进行的动作。'],
  ['You ___ reading. 表示过去正在读，应填什么？', 'were', 'was', 'you 的 be 过去形式在这里用 were。'],
]);
topic('time', '表达与变化', '时间前为什么有 in、on、at', [
  '具体钟点常用 at，星期和具体日期常用 on，月份、年份以及 in the morning 这样的时间段常用 in。',
  '先认识 at two（两点）、on Monday（星期一）、in May（五月）。two、Monday、May 分别是数字、星期和月份的名称。',
], [['at two', '在两点', '具体钟点前用 at。'], ['on Monday', '在星期一', '星期几前用 on。']], [
  ['说“在星期一”，应选什么？', 'on Monday', 'at Monday', '星期几前通常用 on。'],
  ['说“在两点”，应选什么？', 'at two', 'in two', '这里表示具体钟点，用 at。'],
]);
topic('future', '表达与变化', '怎样说接下来准备做什么', [
  'I am going to read. 可以表示我打算阅读。这里先把 am going to 看作说明计划的结构，后面接动作词。',
  'You are going to read. 中 you 与 are 搭配。还会遇到 will 等其他未来表达，这一课先认识计划的说法。',
], [['I am going to read.', '我打算阅读。', 'read 是接下来准备做的事。'], ['You are going to read.', '你打算阅读。', 'you 后面用 are going to。']], [
  ['I am going to read. 在这里表达什么？', '阅读的计划', '昨天已经读完', '这里用 be going to 谈准备做的事情。'],
  ['You ___ going to read. 应填什么？', 'are', 'am', 'you 与 are 搭配。'],
]);
topic('comparison', '表达与变化', '怎样说更大和更好', [
  '比较两个东西时，big 可以变成 bigger，表示更大；good 的比较形式是 better，表示更好。这种形式叫比较级。',
  'than 用来引出比较的另一方。This cup is bigger than that cup. 是这个杯子比那个杯子大。先认识 this（这个）和 that（那个）。',
], [['This cup is bigger.', '这个杯子更大。', 'bigger 表示更大，big 的 g 要重复。'], ['This book is better.', '这本书更好。', 'good 的比较形式是 better。']], [
  ['good 表示好，“更好”应该用什么？', 'better', 'gooder', 'good 的比较形式有特殊变化，需要一起记。'],
  ['比较时 than 常用来做什么？', '引出比较的另一方', '表示所有东西都相同', '例如 bigger than that cup 表示比那个杯子更大。'],
]);
topic('quantity', '表达与变化', '几个和一点怎样说', [
  'a few books 是几本书，a little water 是一点水。能数的复数名词常与 a few 搭配，不可数名词常与 a little 搭配。',
  '去掉 a，few 和 little 往往强调少到不够。先把带 a 的两组用于表达“有一些”，a bit of water 也能表示一点水。',
], [['a few books', '几本书', 'books 可以数，使用 a few。'], ['a little water', '一点水', 'water 在这里不可数，使用 a little。']], [
  ['“几本书”应选什么？', 'a few books', 'a little books', 'books 是可数名词复数，用 a few。'],
  ['“一点水”应选什么？', 'a little water', 'a few water', 'water 作为物质表达时，用 a little。'],
]);
topic('purpose', '表达与变化', 'to 怎样说明目的', [
  'I sit down to read. 是“我坐下来读书”。后面的 to read 说明坐下来的目的：为了阅读。',
  '这里用 to 加动作词的原形来说明目的。to 还有别的作用，遇到不同结构要结合句子理解。',
], [['I sit down to read.', '我坐下来读书。', 'to read 说明坐下来的目的。'], ['I stop to rest.', '我停下来休息。', 'stop 是停下，rest 是休息。']], [
  ['I stop to rest. 中，为什么停下？', '为了休息', '为了停止休息', 'to rest 表示停下来的目的。'],
  ['这里说明目的的 to 后面用哪种形式？', '动作词的原形', '所有动作词都加 s', '例如 to read、to rest。'],
]);
topic('verb-patterns', '表达与变化', '两个动作词相遇时', [
  '“我想读书”说 I want to read.；“我喜欢阅读这件事”可以说 I enjoy reading.。want 常接 to 加动作词，enjoy 后接 -ing 形式。',
  '这些是词的搭配习惯，需要连在一起学。不能给所有动词后面都套同一种形式。',
], [['I want to read.', '我想阅读。', 'want 是想要，后面用 to read。'], ['I enjoy reading.', '我喜欢阅读。', 'enjoy 后面用 reading。']], [
  ['enjoy 后面在这里接什么？', 'reading', 'to read', 'enjoy 常接动作词的 -ing 形式。'],
  ['want 后面在这里接什么？', 'to read', 'reading', 'want to read 是常用搭配。'],
]);
topic('adjective-pairs', '表达与变化', '形容词也有自己的搭配', [
  'good at 表示擅长，afraid of 表示害怕。这里的小词要跟前面的描述词一起学。',
  'I am good at reading. 表示我擅长阅读。at 后面的动作词在这里用 reading。I am afraid of dogs. 是我怕狗。',
], [['I am good at reading.', '我擅长阅读。', '把 good at 当作一组来理解。'], ['I am afraid of dogs.', '我怕狗。', '把 afraid of 当作一组来理解。']], [
  ['“擅长”对应哪一组？', 'good at', 'good of', 'good at 是这里需要的搭配。'],
  ['“害怕”对应哪一组？', 'afraid of', 'afraid at', 'afraid of 后面接害怕的人或东西。'],
]);
topic('ed-ing', '表达与变化', '有趣和感到有趣', [
  'interesting 表示让人感兴趣的，interested 表示某人感兴趣。The book is interesting. 是书很有趣；I am interested. 是我感兴趣。',
  '这里它们是描述性质或感受的词，不是看见 -ed 就一定表示过去。根据整个句子判断它的作用。',
], [['The book is interesting.', '这本书很有趣。', '说书让人感兴趣。'], ['I am interested.', '我感兴趣。', '说我产生了兴趣。']], [
  ['说一本书让人感兴趣，应选什么？', 'interesting', 'interested', 'interesting 描述让人产生兴趣的性质。'],
  ['I am interested. 里的 interested 主要描述什么？', '我的感受', '事情一定发生在昨天', '词尾相同不代表在所有句子里的作用都相同。'],
]);
topic('dictionary', '理解与查阅', '怎样查懂一个词', [
  '查词时先看当前句子，再看相关释义、词性、读音和简单例句。一个词可能有不止一种意思或词性。',
  'n. 常表示名词，v. 常表示动词，adj. 常表示形容词。例如 book 可以是书，也可以是预订；要看它在句子里做什么。',
], [['a book', '一本书', '这里 book 是名词。'], ['Book a room.', '预订一个房间。', '这里 book 是动作词；room 是房间。']], [
  ['词典中的 v. 通常代表什么？', '动词', '形容词', 'v. 是 verb 的缩写；adj. 才常表示形容词。'],
  ['一个词有多个意思时，应先参考什么？', '它所在的句子', '永远只选第一条释义', '句中作用和前后内容能帮助选择合适的意思。'],
]);

// Sound teaching uses complete, verified word recordings. IPA symbols themselves
// are never sent to speech synthesis or claimed to be isolated phoneme audio.
const soundGroups: [string, string, string[], Example[], Check[]][] = [
  ['i', '听清 /ɪ/ 和 /iː/', ['音标放在 / / 中，表示声音。/ɪ/ 和 /iː/ 都让舌头靠前，但舌位和口形也有区别，不能只靠拖长区分。', '/ɪ/ 较放松，嘴略张；/iː/ 舌位较高，嘴角略向两侧。先听整词中的元音，再跟着读。'], [['ship', '船', '/ʃɪp/：中间是较放松的 /ɪ/。'], ['sheep', '绵羊', '/ʃiːp/：中间是 /iː/。']], [['两个词主要区别在哪里？', '中间的元音', '开头的字母完全不同', 'ship 和 sheep 的主要发音区别是中间的元音。'], ['区分这两个音，只拉长声音够吗？', '还要留意口形和舌位', '只看字母数量就够了', '音质也不同，听示范并观察发音位置。']]],
  ['ae', '听清 /e/ 和 /æ/', ['/e/ 舌头靠前，嘴半开；/æ/ 通常张口更大，下巴更低。', '下面两个词都以 /b/ 开头、/d/ 结尾。先比较中间的声音，再把完整单词连起来读。'], [['bed', '床', '/bed/：中间是 /e/；有些词典用 /ɛ/ 标这个音。'], ['bad', '坏的', '/bæd/：中间是 /æ/，张口更大。']], [['bad 中的元音怎样发？', '比 bed 通常张口更大', '双唇一直闭紧', '嘴张开、舌头靠前；比较示范中的音质。'], ['bed 和 bad 主要区别是什么？', '中间元音不同', '只有大小写不同', '这是两个不同单词，元音差别会改变意思。']]],
  ['u', '听清 /ʊ/ 和 /uː/', ['这两个音都需要嘴唇略圆。/ʊ/ 较放松，/uː/ 舌位通常更高、更靠后。', '不要把所有含 oo 的词读成同一个音。字母组合只提供线索，读音还要结合单词核对。'], [['full', '满的', '/fʊl/：中间是 /ʊ/。'], ['fool', '傻瓜', '/fuːl/：中间是 /uː/。']], [['full 中间是哪一个音？', '/ʊ/', '/uː/', 'full 使用 /ʊ/，fool 使用 /uː/。'], ['这两个音的嘴唇通常怎样？', '略圆', '必须咬住舌尖', '发元音时气流较通畅；这里嘴唇略圆。']]],
  ['vowels', '张口的元音和放松的元音', ['/ɑː/ 通常张口较大、舌头较低；/ʌ/ 在重读位置出现，嘴唇放松。', '另一种常见的放松元音是 /ə/，常出现在不重读的位置，例如 about 的开头。不要把不重读理解成完全不发声。'], [['hot', '热的', '常见美式读法 /hɑːt/；不同口音会有差异。'], ['cup', '杯子', '/kʌp/：中间是 /ʌ/。']], [['音标 /ə/ 常出现在哪里？', '不重读的音节里', '只在每个单词最后', '例如 about 开头的 a 常读 /ə/。'], ['不重读表示什么？', '读得较轻，但仍可能有声音', '一律完全不读', '弱读是声音的轻重变化，不等于随意删除。']]],
  ['glides', '声音怎样滑动', ['/eɪ/、/aɪ/、/oʊ/ 是常见的双元音：在同一个音节里，口形从一个位置滑向另一个位置。', '/aʊ/ 可在 now 里听到，/ɔɪ/ 可在 boy 里听到。先跟读，感受口形的移动，不在中间加停顿。'], [['day', '一天', '/deɪ/：口形随 /eɪ/ 滑动。'], ['my', '我的', '/maɪ/：中间是 /aɪ/。'], ['go', '去', '/ɡoʊ/：常见美式 /oʊ/。'], ['now', '现在', '/naʊ/：中间是 /aʊ/。'], ['boy', '男孩', '/bɔɪ/：中间是 /ɔɪ/。']], [['双元音怎样读？', '在一个音节里平滑移动口形', '中间停很久分成两个词', '双元音的两个部分属于同一个音节。'], ['my 中间的声音是哪一个？', '/aɪ/', '/eɪ/', 'my 的音标是 /maɪ/。']]],
  ['stops', '嘴里先挡住再放开的音', ['/p b/ 先闭双唇，/t d/ 舌尖接近上齿龈，/k ɡ/ 用舌后部挡住气流，再放开。', '这些叫塞音。/p t k/ 与 /b d ɡ/ 成对比较；听整词时，同时留意气流和声带振动，词尾不要额外加一个“呃”。'], [['pat', '轻拍', '/pæt/：开头用双唇。'], ['bat', '球棒', '/bæt/：比较开头与 pat 的区别。'], ['ten', '十', '/ten/：开头是 /t/。'], ['den', '窝', '/den/：开头是 /d/。'], ['coat', '外套', '/koʊt/：开头是 /k/。'], ['goat', '山羊', '/ɡoʊt/：开头是 /ɡ/。']], [['/p/ 和 /b/ 起始时哪部分闭合？', '双唇', '只有鼻子', '双唇先合上挡住气流，再放开。'], ['读词尾的塞音时，应注意什么？', '避免额外添一个元音', '每次都加一个“呃”', '多加元音可能多出一个音节，改变听到的词。']]],
  ['th', '舌尖靠近牙齿的音', ['/θ/ 和 /ð/ 都让舌尖轻触上下门齿之间或靠近上门齿，气流从缝隙通过，不要用力咬舌头。', '/θ/ 声带通常不振动，/ð/ 通常振动。可以轻触喉咙感受，但以自然发音为准。th 在不同单词中可能表示其中一个音。'], [['thin', '薄的', '/θɪn/：开头是 /θ/。'], ['this', '这个', '/ðɪs/：开头是 /ð/。']], [['发这两个音时，舌尖靠近哪里？', '门齿附近', '始终缩到喉咙里', '舌尖轻触齿间或靠近上门齿，气流从缝隙经过。'], ['/ð/ 和 /θ/ 常见的区别是什么？', '声带是否振动', '是否必须大声喊', '轻触喉咙可帮助感受，不需要用力喊。']]],
  ['friction', '气流摩擦的声音', ['/f v/ 让上门齿轻触下唇；/s z/ 让舌头靠近齿龈、留出气流通道。', '/ʃ/ 和 /ʒ/ 的舌位稍靠后，嘴唇可略圆；/h/ 像轻轻呼气。先在词里听这些声音，不把中文谐音当成标准。'], [['fan', '风扇', '/fæn/：上齿轻触下唇。'], ['van', '厢式车', '/væn/：比较 /v/ 的振动。'], ['sip', '小口喝', '/sɪp/：开头是 /s/。'], ['zip', '拉链', '/zɪp/：开头是 /z/。'], ['ship', '船', '/ʃɪp/：开头是 /ʃ/。'], ['vision', '视力', '/ˈvɪʒən/：中间含 /ʒ/。'], ['hat', '帽子', '/hæt/：开头轻轻呼气。']], [['/f/ 发音时，上门齿靠近哪里？', '下唇', '鼻尖', '上门齿轻触下唇，让气流摩擦通过。'], ['/h/ 更接近哪种动作？', '轻轻呼气', '紧闭嘴唇不出气', 'hat 开头的 /h/ 是轻呼气的声音。']]],
  ['ch', '先挡住再摩擦的音', ['/tʃ/ 和 /dʒ/ 都从短暂阻挡气流开始，再接摩擦；把整个过程连成一个音。', 'chair 的开头是 /tʃ/，job 的开头是 /dʒ/。后者通常有声带振动。不要在阻挡和摩擦之间加一个元音。'], [['chair', '椅子', '/tʃer/：常见美式读法，先关注开头。'], ['job', '工作', '/dʒɑːb/：先关注开头的 /dʒ/。']], [['/tʃ/ 怎样组成？', '先短暂阻挡，再摩擦放开', '两个音之间插入一个词', '把动作连起来，不要在中间插入元音。'], ['job 开头是哪一个音？', '/dʒ/', '/tʃ/', 'job 开头是 /dʒ/。']]],
  ['nasal', '声音怎样经过鼻腔', ['/m n ŋ/ 都是鼻音：口腔某处挡住气流，让空气经过鼻腔。/m/ 闭双唇，/n/ 舌尖靠上齿龈，/ŋ/ 用舌后部。', 'sing 结尾的 /ŋ/ 是一个音，在这个词里不要额外添一个 /ɡ/。其他带 ng 的单词还需要按实际读音判断。'], [['sum', '总和', '/sʌm/：结尾闭双唇。'], ['sun', '太阳', '/sʌn/：结尾舌尖靠上齿龈。'], ['sing', '唱歌', '/sɪŋ/：结尾用舌后部。']], [['/m/ 结尾时，嘴唇怎样？', '合上', '一直大张', 'sum 结尾闭双唇，声音经鼻腔通过。'], ['sing 的结尾怎样读？', '/ŋ/，不额外加 /ɡ/', '固定多读一个完整的 go', 'sing 的结尾音标是 /ŋ/。']]],
  ['lr', '听清 l 和 r', ['/l/ 常让舌尖接触上齿龈，气流从舌头两边通过。常见美式 /r/ 的舌头向后收或拱起，通常不碰齿龈。', '不要只用中文“勒、日”去代替。比较 light 和 right，再慢慢跟读，先追求能分清。'], [['light', '光', '/laɪt/：舌尖接触上齿龈。'], ['right', '右边的', '/raɪt/：舌头通常不碰齿龈。']], [['/l/ 开头时，舌尖常怎样？', '接触上齿龈', '夹在双唇中间', 'light 开头舌尖接触上齿龈。'], ['light 和 right 主要区别在哪里？', '开头的辅音', '中间的双元音', '它们中间都是 /aɪ/，主要区别在 /l/ 与 /r/。']]],
  ['wy', 'w 和 y 开头怎样读', ['/w/ 开始时嘴唇略圆，再滑向后面的元音。/j/ 是 yes 开头的声音，舌头靠前偏高，再滑向后面的元音。', '音标 /j/ 不等于字母 J 的名称。字母名和音标属于不同的标记方式。', '美式带 r 的元音也会用 /ɝː/ 或 /ɚ/ 等写法；例如 bird /bɝːd/ 和 teacher /ˈtiːtʃɚ/。先结合整词听。'], [['wet', '湿的', '/wet/：嘴唇由略圆滑向后面的元音。'], ['yes', '是的', '/jes/：开头是 /j/。'], ['bird', '鸟', '常见美式 /bɝːd/。'], ['teacher', '老师', '常见美式 /ˈtiːtʃɚ/，结尾是较轻的带 r 元音。']], [['yes 开头的 /j/ 是什么？', '一个声音的音标', '英语字母 J 的名称', '不要把音标符号和字母名称混为一谈。'], ['/w/ 开始时，嘴唇通常怎样？', '略圆后滑向元音', '紧咬下唇始终不动', 'wet 中的 /w/ 需要口形平滑过渡。']]],
];
for (const [id, title, explanation, examples, checks] of soundGroups) topic(`sound-${id}`, '音标与发音', title, explanation, examples, checks, true, 'sounds');
topic('syllables', '整句话怎么读', '音节和重音是什么', [
  '读词时能感到一个或几个声音的节拍，这些单位叫音节。teacher 有两个音节，第一部分读得更突出。',
  '音标中的 ˈ 标在主要重读音节前。重读常通过更清晰的元音以及时长、音高等体现，不需要大声喊。',
], [['teacher', '老师', '/ˈtiː.tʃɚ/：第一音节较突出。'], ['about', '关于', '/əˈbaʊt/：第二音节较突出，开头较轻。']], [
  ['音标里的 ˈ 告诉我们什么？', '后面是主要重读音节', '这里一定要停顿', 'ˈ 是主重音标记，不是停顿号。'],
  ['about 的哪个部分更突出？', '后面的 bout', '前面的 a', 'about 的音标中重音标在第二音节前。'],
], true, 'sounds');
topic('linking', '整句话怎么读', '相邻的声音怎样连接', [
  '自然说话时，单词之间常不逐个停顿。同一个意群里，一个词以辅音结束、后面以元音开始时，声音常连起来，例如 pick it up。',
  '下面的连接线是帮助观察的标记，拼写仍然保持空格。连接依据实际声音；要强调或停顿时，读法也会变化。先听整句，再对比逐词声音。',
], [['Pick it up.', '把它捡起来。', 'pick‿it‿up：pick 的 /k/ 接到 it；it 的 /t/ 接到 up。美式 /t/ 还可能有轻拍变化。'], ['Turn it on.', '把它打开。', 'turn‿it‿on：留意单词间的平滑过渡。']], [
  ['连读主要看什么？', '相邻的实际声音和停顿', '只看最后一个字母长什么样', '拼写与声音并不一一对应，要结合实际读音。'],
  ['连读后，书写时的空格怎样处理？', '仍然保留', '全部删掉', '连读改变说话的衔接，不改变单词的正常拼写。'],
], true, 'connected');
topic('weak', '整句话怎么读', '为什么有些小词听起来很轻', [
  '句子里常把要传达的重点读得突出，把某些小词读轻。例如 a cup of tea 中，a 和 of 往往较轻。',
  '这叫弱读，常出现 /ə/ 这样的放松元音。强调某个小词时也可能读完整；轻读不等于随意把词删掉。',
], [['a cup of tea', '一杯茶', '留意 a 和 of 比 cup、tea 更轻。'], ['I can swim.', '我会游泳。', '不特别强调 can 时，它常较轻，重点可落在 swim。']], [
  ['弱读表示什么？', '某些词在句中读得较轻', '这些词没有任何作用', '它们仍参与表达，只是声音较轻。'],
  ['特别强调 can 时，它还能读得更完整吗？', '可以，读法会随重点变化', '绝对不可以', '弱读取决于句子重点和实际语境。'],
], true, 'connected');
topic('intonation', '整句话怎么读', '停顿和语调怎样帮助理解', [
  '把一句话按意思分成小组，在合适的位置停顿，叫按意群读。先保持意思完整，再考虑在哪里换气。',
  '语调是声音高低的走向。问句、陈述和强调会有常见的语调习惯，但也受态度和情境影响，不是每个问号都强制同一种声调。',
], [['Are you ready?', '你准备好了吗？', 'ready 表示准备好了；留意询问时的声音走向。'], ['Yes, I am ready.', '是的，我准备好了。', 'Yes 后可以有短停顿，后半句作为一组来读。']], [
  ['选择停顿位置时，先看什么？', '意思是否自然成组', '每读一个单词都停很久', '按意思分组能保持句子连贯。'],
  ['问句的语调是否永远完全相同？', '还会受情境和态度影响', '只要有问号就完全相同', '学习常见模式，同时留意实际情境。'],
], true, 'connected');
topic('endings', '整句话怎么读', 's 和 ed 为什么有不同读音', [
  '词尾 s 常见 /s/、/z/、/ɪz/ 三种读法，例如 cats、dogs、buses。选择与前一个声音有关，不是永远读字母 S 的名称。',
  '规则动词过去式 -ed 常读 /t/、/d/、/ɪd/，例如 walked、played、wanted。先分组听；在 /t/ 或 /d/ 后的 -ed 常多出一个音节。',
], [['cats', '多只猫', '/kæts/：词尾是 /s/。'], ['dogs', '多只狗', '/dɔːɡz/：词尾是 /z/，元音有口音差异。'], ['buses', '多辆公交车', '/ˈbʌsɪz/：词尾是 /ɪz/。'], ['walked', '走过', '词尾 -ed 在这里读 /t/。'], ['played', '玩过', '词尾 -ed 在这里读 /d/。'], ['wanted', '曾想要', '词尾 -ed 在这里读 /ɪd/，多出一个音节。']], [
  ['词尾 s 是否总读字母 S 的名称？', '要结合前面的声音判断', '总是读字母名称', '先比较 cats、dogs 和 buses。'],
  ['wanted 中的 -ed 属于哪一组？', '/ɪd/', '/s/', 'want 以 /t/ 结尾，过去式 -ed 常读 /ɪd/。'],
], true, 'sounds');

// Removed introductory material is retained only for historical session parsing.
const referenceIds = new Set(['foundation-handwriting', 'foundation-letters', 'foundation-words', 'foundation-sentence']);
const referenceTopics = foundationTopics.filter(item => referenceIds.has(item.id));
referenceTopics.forEach(item => { item.referenceOnly = true; item.hidden = true; });
// Alternate practical sentence knowledge and sound study.
const soundTopics = foundationTopics.filter(item => item.id.startsWith('foundation-sound-'));
const otherTopics = foundationTopics.filter(item => !item.id.startsWith('foundation-sound-') && !item.referenceOnly);
const entryOrder = ['word-concepts', 'nouns', 'verbs', 'letter-sound', 'adjectives', 'pronouns', 'word-order', 'be', 'writing-conventions'].map(id => `foundation-${id}`);
otherTopics.sort((a, b) => (entryOrder.includes(a.id) ? entryOrder.indexOf(a.id) : entryOrder.length) - (entryOrder.includes(b.id) ? entryOrder.indexOf(b.id) : entryOrder.length));
const ordered: FoundationTopic[] = [];
for (const [index, item] of otherTopics.entries()) {
  ordered.push(item);
  if (index >= 3 && (index - 3) % 3 === 0 && soundTopics.length) ordered.push(soundTopics.shift()!);
}
ordered.push(...soundTopics, ...referenceTopics);
foundationTopics.splice(0, foundationTopics.length, ...ordered);
const prerequisites: Record<string, string[]> = {
  'word-concepts': [], handwriting: [], 'writing-conventions': ['word-concepts'], letters: [], words: ['letters'], sentence: ['words'], 'letter-sound': ['word-concepts'], nouns: ['word-concepts'], verbs: ['nouns'], adjectives: ['nouns'], pronouns: ['word-concepts'],
  'word-order': ['verbs', 'pronouns'], be: ['pronouns', 'adjectives'], roles: ['word-order', 'pronouns'], articles: ['nouns', 'letter-sound'], plural: ['nouns'],
  countable: ['plural', 'articles'], the: ['articles'], position: ['adjectives', 'word-order'], place: ['nouns'], possessive: ['pronouns', 'nouns'], there: ['be', 'articles'],
  present: ['verbs', 'pronouns'], 'be-negative': ['be'], 'do-negative': ['present'], 'be-question': ['be'], 'do-question': ['present', 'do-negative'], wh: ['be-question'],
  can: ['verbs', 'pronouns'], commands: ['verbs', 'word-order'], contractions: ['be', 'do-negative'], 'present-progressive': ['be', 'present'], past: ['present'],
  'past-progressive': ['past', 'present-progressive'], time: ['place'], future: ['be', 'verbs'], comparison: ['adjectives'], quantity: ['countable'],
  purpose: ['verbs', 'word-order'], 'verb-patterns': ['present-progressive', 'purpose'], 'adjective-pairs': ['adjectives', 'present-progressive'], 'ed-ing': ['adjectives', 'past'],
  dictionary: ['nouns', 'verbs', 'letter-sound'], syllables: ['letter-sound'], linking: ['syllables', 'sound-stops'], weak: ['syllables', 'sound-vowels'],
  intonation: ['syllables', 'linking'], endings: ['plural', 'past', 'sound-stops'],
};
foundationTopics.forEach(item => { item.prerequisiteIds = (prerequisites[item.id.replace('foundation-', '')] ?? ['letter-sound']).map(id => `foundation-${id}`); });
export const foundationPhrases = foundationTopics.flatMap(topic => topic.examples);
// A separate reading catalog extends equivalent pages without changing old
// lessons, exercise IDs, prerequisites, or progress parsing.
export const foundationTutorialCatalog: (FoundationTopic & { tutorial?: FoundationTutorial })[] = foundationTopics.map(item => {
  const tutorial = foundationTutorials.find(tutorial => tutorial.id === item.id);
  return tutorial ? { ...item, group: tutorial.group, tutorial } : item;
});
for (const tutorial of foundationTutorials) if (!foundationTutorialCatalog.some(item => item.id === tutorial.id)) {
  foundationTutorialCatalog.push({ id: tutorial.id, title: tutorial.title, group: tutorial.group, sound: tutorial.sound,
    explanation: [tutorial.question, tutorial.takeaway], examples: tutorial.sections.flatMap(section => section.examples ?? []),
    checks: [], prerequisiteIds: [], source: tutorial.sound ? 'sounds' : 'grammar', tutorial });
}
// Kept only for the existing audio manifest; no alphabet teaching UI uses this.
export const foundationAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => ({ id: `foundation-letter-${letter.toLowerCase()}`, en: letter, zh: `${letter} / ${letter.toLowerCase()}` }));
function arrangeTokens(tokens: string[], id: string) {
  const result = [...tokens];
  let seed = [...id].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
  for (let i = result.length - 1; i > 0; i--) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const j = (seed >>> 0) % (i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  if (result.join(' ') === tokens.join(' ')) result.push(result.shift()!);
  return result;
}
const recallWords: Record<string, string[]> = {
  be: ['am', 'are'], roles: ['I', 'me'], articles: ['a', 'an'], plural: ['book', 'books'], countable: ['cup', 'cups'], the: ['a', 'The'], place: ['in', 'on'],
  possessive: ['my'], present: ['like', 'likes'], 'be-negative': ['not'], 'do-negative': ['do', 'does'], 'be-question': ['Are', 'Is'], 'do-question': ['Do', 'Does'],
  wh: ['Where', 'Who'], can: ['can', 'Can'], contractions: ["I'm", "don't"], 'present-progressive': ['am', 'is'], past: ['talked', 'walked'],
  'past-progressive': ['was', 'were'], time: ['at', 'on'], future: ['am', 'are'], comparison: ['bigger', 'better'], quantity: ['few', 'little'],
  purpose: ['to'], 'verb-patterns': ['to', 'reading'], 'adjective-pairs': ['at', 'of'], 'ed-ing': ['interesting', 'interested'],
};
export const foundationLessons: LearningLesson[] = foundationTopics.map(item => {
  const tasks: LearningExercise[] = item.checks.map(([prompt, answer, distractor, explanation], index) => ({
    id: `${item.id}-understand-${index}`, kind: 'choice', prompt, options: index % 2 ? [distractor, answer] : [answer, distractor], answers: [answer], explanation,
    knowledgeIds: [item.id], ability: 'meaning', learningDifficulty: index === 0 ? 'recognition' : 'context',
  }));
  for (const [index, phrase] of item.examples.entries()) {
    const other = item.examples[(index + 1) % item.examples.length];
    // Real listening evidence only; example text is hidden until feedback.
    if (item.id !== 'foundation-handwriting') tasks.push({ id: `${item.id}-listen-${index}`, kind: 'listen', prompt: '听录音，选择对应的内容。', audioId: phrase.id,
      options: index % 2 ? [other.en, phrase.en] : [phrase.en, other.en], answers: [phrase.en], explanation: `${phrase.zh}。${phrase.note}`,
      knowledgeIds: [item.id], ability: 'listening', learningDifficulty: 'context' });
    if (!item.sound && phrase.en.trim().split(/\s+/).length > 1) {
      const tokens = phrase.en.replace(/[.!?]$/, '').split(/\s+/);
      tasks.push({ id: `${item.id}-order-${index}`, kind: 'order', prompt: `用下面的词组成“${phrase.zh}”。`, options: arrangeTokens(tokens, phrase.id),
        answers: [phrase.en], explanation: phrase.note ?? item.explanation[0], knowledgeIds: [item.id], ability: 'context', learningDifficulty: 'context' });
      const focusWords = recallWords[item.id.replace('foundation-', '')] ?? [];
      const match = [...phrase.en.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)*/g)].find(word => focusWords.includes(word[0]));
      if (match) tasks.push({ id: `${item.id}-recall-${index}`, kind: 'fill', prompt: `补全“${phrase.zh}”，只填写缺少的部分。`,
        parts: [phrase.en.slice(0, match.index), phrase.en.slice(match.index! + match[0].length)], blanks: [[match[0]]],
        explanation: phrase.note ?? item.explanation[0], knowledgeIds: [item.id], ability: 'context', learningDifficulty: 'recall' });
    }
  }
  return { id: item.id, title: item.title, goal: item.explanation[0], explanation: item.explanation.join('\n\n'), phrases: item.examples,
    exercises: tasks, rechecks: [], practice: [], learningTargets: [item.id], learningGoal: item.sound ? 'listening' : 'communication',
    prerequisiteIds: item.prerequisiteIds, focusLimit: 2, referenceOnly: item.referenceOnly };
});
// Contiguous groups preserve the interleaved teaching order. Knowledge-library
// categories remain independent of the adaptive course sequence.
export const foundationUnits: DailyUnit[] = [];
for (const [index, item] of foundationTopics.entries()) {
  let unit = foundationUnits[foundationUnits.length - 1];
  if (!unit || unit.title !== item.group) {
    unit = { id: `foundation-unit-${foundationUnits.length}`, title: item.group, goal: item.group, description: '从讲解和示范开始，再用简单练习逐步理解。', lessons: [] };
    foundationUnits.push(unit);
  }
  unit.lessons.push(foundationLessons[index]);
}
