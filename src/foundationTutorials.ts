import type { DailyPhrase } from './dailyCourse';

// Reading-only material. These examples never enter the historical lesson pool.
export type TutorialExample = DailyPhrase & { ipa?: string; parts?: [meaning: string, text: string][]; demo?: string; separate?: boolean };
export type TutorialSection = { title: string; text: string[]; examples?: TutorialExample[]; sounds?: [label: string, id: string][] };
export type FoundationTutorial = {
  id: string; title: string; group: string; sound: boolean; batch: 'A' | 'B' | 'C' | 'D';
  question: string; sections: TutorialSection[]; boundary: string; takeaway: string;
  try: { prompt: string; options: string[]; explanation: string[]; reveal: string };
  related: string[]; source: string; accent?: string;
};
const grammar = 'https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference/clause-structure-verb-patterns';
const spelling = 'https://www.teachingenglish.org.uk/teaching-resources/teaching-adults/activities/pre-intermediate-a2/sound-and-spelling-correspondence';
const connected = 'https://www.teachingenglish.org.uk/professional-development/teachers/knowing-subject/connected-speech-part-1';
const conjunctions = 'https://learnenglishteens.britishcouncil.org/sites/teens/files/gs_conjunctions_1.pdf';
const exampleKey = (text: string) => {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
};
const ex = (en: string, zh: string, note: string, extra: Partial<TutorialExample> = {}): TutorialExample => ({
  id: `foundation-tutorial-example-${exampleKey(`${en}\n${zh}\n${note}`)}`, en, zh, note, ...extra,
});
const practice = (prompt: string, options: string[], explanation: string[], reveal = explanation[0]) => ({ prompt, options, explanation, reveal });
export const foundationTutorials: FoundationTutorial[] = [
  {
    id: 'foundation-word-order', title: '句子语序：谁、做什么、对什么', group: '句子怎么组成', sound: false, batch: 'A',
    question: '“我阅读”和“我读一本书”都能说完整。多出来的那组词在做什么？',
    sections: [
      { title: '先找到谁和动作', text: ['I 表示我，read 表示阅读。这句话先告诉我们谁在做什么，已经可以成立。这里 read 是一般现在时，读 /riːd/。'], examples: [ex('I read.', '我阅读。', '不指定读什么，也是一句完整的表达。', { parts: [['谁 · 主语', 'I'], ['做什么 · 这里的谓语动词', 'read']] })] },
      { title: '再说明动作涉及什么', text: ['a book 是“一本书”。把这两个词放在一起看：整组说明阅读的对象，在这句里作宾语。宾语是句中角色，不是一个词性名称。'], examples: [ex('I read a book.', '我读一本书。', 'book 是书，a 表示这里说的是一本。', { parts: [['谁', 'I'], ['做什么', 'read'], ['读什么 · 宾语', 'a book']] })] },
      { title: '把方法用到原有短句', text: ['I 是我，drink 是喝，water 是水；We 是我们，books 是书的复数形式。先问谁做，再问动作涉及什么。'], examples: [ex('I drink water.', '我喝水。', '主语是 I，动作是 drink，对象是 water。'), ex('We read books.', '我们读书。', '把 We 和 books 在这句里的分工分开。')] },
    ],
    boundary: '不是每句话都要有宾语。这里先标“谓语动词”，不表示所有句子的谓语都只有一个动词；后面还会遇到描述状态等其他结构。',
    takeaway: '先问这句讲谁，再找动作；有动作对象时，把整个对象词组一起看。',
    try: practice('在 We read books. 中，哪一部分说明“谁在读”？', ['We', 'books'], ['We 是我们，承担主语角色；books 是读的对象，作宾语。', 'books 是书的复数形式。真正做阅读动作的是 We，也就是我们。']),
    related: ['foundation-noun-roles', 'foundation-be', 'foundation-sentence-expand'], source: grammar,
  },
  {
    id: 'foundation-be', title: '为什么需要 am、is、are', group: '句子怎么组成', sound: false, batch: 'A',
    question: '中文说“我很开心”不用“是”，英语为什么还要有 am？',
    sections: [
      { title: '动作和状态，表达方式不同', text: ['read 是阅读这个动作。happy 是开心的，描述状态；在这个完整陈述句中，用 am 把 I 和 happy 连接起来。'], examples: [ex('I read.', '我阅读。', '这里 read 自己说明动作。'), ex('I am happy.', '我很开心。', '这里 am 是 be 的一种形式；happy 描述我，不是动作的宾语。', { parts: [['谁', 'I'], ['连接主语和状态', 'am'], ['什么状态', 'happy']] })] },
      { title: '也可以说明身份', text: ['She 是她，a teacher 是一位老师。整组 a teacher 说明她的身份，不是被动作影响的对象。语法上，这里说明主语的部分叫表语。'], examples: [ex('She is a teacher.', '她是一位老师。', 'is 连接 She 和她的身份 a teacher。', { parts: [['谁', 'She'], ['连接身份', 'is'], ['什么身份 · 表语', 'a teacher']] })] },
      { title: '主语不同，形式跟着换', text: ['现在先认识 I am、you/we/they are、he/she/it is：我用 am，你／我们／他们用 are，他／她／它用 is。be 是这些形式的统称，不是在每个句子里直接写 be。'], examples: [ex('You are happy.', '你很开心。', 'you 是你，这里配 are。')] },
    ], boundary: 'am、is、are 不总是翻译成“是”；也不能遇到中文“是”就一律填 is。先判断句子结构和主语。',
    takeaway: '这类状态或身份句保留 be，把主语和对主语的说明连接起来。',
    try: practice('I ___ happy. 在本篇这个现在时句子中填什么？', ['am', 'is'], ['I 在这里与 am 搭配，happy 是开心的状态。', 'is 在这类现在时例子中配 he、she、it；I 要用 am。']), related: ['foundation-word-order', 'foundation-be-negative'], source: grammar,
  },
  {
    id: 'foundation-sentence-expand', title: '短句怎样一步一步变长', group: '句子怎么组成', sound: false, batch: 'A',
    question: '“我阅读”到“我每天晚上在家读一本书”，每次多出来的信息在说明什么？',
    sections: [
      { title: '先有一个完整的核心', text: ['I 是我，read 是阅读。这里谈平时的活动，read 用 /riːd/，不是过去式的 /red/。'], examples: [ex('I read.', '我阅读。', '谁和动作已经说出来。')] },
      { title: '加上读什么', text: ['a book 是一本书，整组说明阅读的对象。'], examples: [ex('I read a book.', '我读一本书。', '增加的是 a book，不是改变原来的动作。')] },
      { title: '再加在哪里', text: ['at home 是在家，作为一组补充地点。home 在这个搭配中不用再加 a 或 the。'], examples: [ex('I read a book at home.', '我在家读一本书。', 'at home 说明阅读发生的地点。')] },
      { title: '最后加什么时候', text: ['every 是每一个，evening 是晚上；every evening 合起来表示每天晚上。把新增信息作为词组理解，比逐字翻译清楚。'], examples: [ex('I read a book at home every evening.', '我每天晚上在家读一本书。', '这一句把对象、地点和时间补充到原来的核心上。', { parts: [['谁', 'I'], ['做什么', 'read'], ['读什么', 'a book'], ['在哪里', 'at home'], ['什么时候', 'every evening']] })] },
    ], boundary: '这是这个例子的一种自然排列，不是五格必填表。时间也可以放在句首；某些动词需要地点等补充，不能把所有地点都认作随意可删。',
    takeaway: '先抓住核心表达，再问每组新增信息补充了什么。',
    try: practice('at home 在本篇的长句里补充什么？', ['在哪里', '读的对象'], ['at home 说明阅读的地点；读的对象是 a book。', 'a book 才是读的对象。at home 表示在家，补充地点。']), related: ['foundation-word-order', 'foundation-position', 'foundation-time'], source: grammar,
  },
  {
    id: 'foundation-position', title: '描述内容为什么有的在前有的在后', group: '句子怎么组成', sound: false, batch: 'A',
    question: '单词都认识，却不知道一句话从哪里看？先把连在一起的词当作一组。',
    sections: [
      { title: '一个东西，可以在前后加说明', text: ['cup 是杯子，red 是红色的，table 是桌子。a red cup 在杯子前说明颜色；the cup on the table 在杯子后说明位置。'], examples: [ex('a red cup', '一个红色的杯子', 'red 放在 cup 前面。'), ex('the cup on the table', '桌子上的那个杯子', 'on the table 放在 cup 后面，说明哪个杯子。')] },
      { title: '现在读一个稍长的完整句子', text: ['girl 是女孩，room 是房间，in the room 是在房间里；likes 是喜欢，this book 是这本书。这里 the 指能确定的那个女孩。'], examples: [ex('The girl in the room likes this book.', '房间里的那个女孩喜欢这本书。', '先把整个主语找到，再看喜欢的对象。', { parts: [['这句在讲谁 · 整组主语', 'The girl in the room'], ['这里的谓语动词', 'likes'], ['喜欢的对象 · 整组宾语', 'this book']] })] },
      { title: '暂时折起位置说明，看清核心', text: ['下面只是帮助观察核心。展开 in the room 后，它限制的是哪个女孩，信息有作用，不能一直忽略。主语是一个女孩，在一般现在时里 like 变成 likes；这篇先看结构，不考词尾变化。'], examples: [ex('The girl likes this book.', '那个女孩喜欢这本书。', '再回到上一句，找出位置说明补充了哪个人。')] },
    ], boundary: 'girl 是名词，但这里作主语的是整个 The girl in the room。这个阅读方法用于本批短句，遇到不同句型还需要看具体结构。',
    takeaway: '找谁／什么、找动作或状态，把连在一起的词组作为整体，再展开修饰信息。',
    try: practice('长句 The girl in the room likes this book. 的完整主语是哪组？', ['The girl in the room', 'girl'], ['整组说明这句讲谁。girl 是核心名词，in the room 也属于这个主语词组。', 'girl 是核心名词，完整主语还包括 The 和限制哪个女孩的 in the room。']), related: ['foundation-noun-roles', 'foundation-sentence-expand', 'foundation-present'], source: grammar,
  },
  {
    id: 'foundation-letter-sound', title: '音标是什么，怎样帮助读词', group: '从声音到单词', sound: true, batch: 'B',
    question: '看到字母 a 就知道怎么读了吗？拼写和读音要分开观察。',
    sections: [
      { title: '拼写告诉你怎么写，音标告诉你怎么读', text: ['cat 是猫，cake 是蛋糕。两词都写 a，里面的声音却不同。斜线里的符号记录声音，不是在读英语字母名称。'], examples: [ex('cat', '猫', '这里 a 对应 /æ/。', { ipa: '/kæt/' }), ex('cake', '蛋糕', '这里 a 对应有滑动的 /eɪ/。', { ipa: '/keɪk/' })] },
      { title: '字母名称与词中的声音不同', text: ['说一个字母的名称是在报它叫什么；读 cat 时要连续发词里的声音。一个声音可以有多个字母共同表示，一个字母也可以在不同词里表示不同声音。上方音标表可以听单音。'] },
      { title: '不用学完所有音才开始读词', text: ['先在一个简单词里看音标、听整词，再观察其中的声音。下一篇用地图这个词示范分解与合成；需要时随时回到音标表。'] },
    ], boundary: '音标是确认读音的工具，不是只按字母一对一换符号。这里不恢复字母表背诵或手写。', takeaway: '把拼写、音标和实际录音放在一起核对。',
    try: practice('cat 和 cake 都有 a，可以因此认定它们里面的 a 声音一样吗？', ['不能，要看具体词的读音', '可以，每个字母只有一个声音'], ['两词分别有 /æ/ 和 /eɪ/，拼写相同不能代替读音核对。', '先听两个完整词。字母 a 在这里对应了不同的声音。']), related: ['foundation-blending', 'foundation-final-e'], source: spelling, accent: '本篇完整词示范为美式 Aria／Guy；上方音标表为英式。',
  },
  {
    id: 'foundation-blending', title: '几个声音怎样连成一个词', group: '从声音到单词', sound: true, batch: 'B',
    question: '地图这个词怎样从几个声音连成一口读出的单词？',
    sections: [
      { title: '先听整个词，再听里面的声音', text: ['map 是地图，音标 /mæp/ 记录三个声音。先点完整词，再按顺序听下方单音。/m/ 双唇闭合发声，/æ/ 张口发元音，/p/ 双唇合拢后短促放开。'], examples: [ex('map', '地图', '英式原站整词录音，和本篇单音采用同一口音。', { ipa: '/mæp/', demo: 'uk-map' })], sounds: [['第一个声音 /m/', 'm'], ['中间声音 /æ/', 'ae'], ['最后声音 /p/', 'p']] },
      { title: '把分解变回一个连续的词', text: ['先自己慢慢发 /m/，接 /æ/，最后放开 /p/；减少中间的停顿，再点完整词对照。/m/ 可以持续，/p/ 是短促的，不能把每个辅音后都添“呃”。分解按钮有停顿，完整词按钮提供连续合成的声音。'], examples: [ex('map', '连起来读：地图', '慢速整词仍是一口连续的 map，保持音高。', { ipa: '/mæp/', demo: 'uk-map' })] },
      { title: '换一个词，声音数和字母数不总相同', text: ['ship 是船，音标 /ʃɪp/ 也有三个声音。开头的 sh 两个字母共同表示 /ʃ/；不要把字母名 s、h 逐个读出来。'], examples: [ex('ship', '船', '把 /ʃ/、/ɪ/、/p/ 连起来，再和完整词比较。', { ipa: '/ʃɪp/', demo: 'uk-ship' })], sounds: [['开头声音 /ʃ/', 'sh'], ['中间声音 /ɪ/', 'ih'], ['末尾声音 /p/', 'p']] },
    ], boundary: '分解是为了观察音素；拼接几个独立录音不等于自然整词。本篇保留原站完整词作为连续合成对照。', takeaway: '先听完整词，拆声音，再减少停顿连起来，用完整录音确认。',
    try: practice('ship 开头的一个声音 /ʃ/，在这个词里由哪段拼写共同表示？', ['sh', 's 和 h 各读一次字母名'], ['sh 共同表示 /ʃ/，ship 是三个声音，不是四个字母名称。', '字母名称不能代替词中的音。这里 sh 一起对应 /ʃ/。']), related: ['foundation-letter-combinations', 'foundation-letter-sound'], source: 'https://dictionary.cambridge.org/help/phonetics.html', accent: '本篇单音及 map／ship 完整词固定使用 Cambridge 英式录音。',
  },
  {
    id: 'foundation-letter-combinations', title: '两个字母，有时共同表示一个声音', group: '拼读与拼写', sound: true, batch: 'B',
    question: 'sh、ch、th 写了两个字母，在这些词里却各表示一个声音。怎么判断？',
    sections: [
      { title: '先比较船和薯片的开头', text: ['ship 是船，chip 在这里是一片薯片。sh 在 ship 中对应 /ʃ/；ch 在 chip 中对应 /tʃ/。/tʃ/ 先短暂阻住气流，再带出摩擦，和 /ʃ/ 有差别。'], examples: [ex('ship', '船', '开头 sh 共同对应 /ʃ/。', { ipa: '/ʃɪp/' }), ex('chip', '一片薯片', '开头 ch 共同对应 /tʃ/。', { ipa: '/tʃɪp/' })] },
      { title: '相同的 th，也有两种常见声音', text: ['thin 是薄的，this 是这个。两者的舌尖都轻靠门齿附近；thin 的 /θ/ 轻轻送气，this 的 /ð/ 加入声带振动。声带是喉部发声时振动的组织。'], examples: [ex('thin', '薄的', '本词 th 对应 /θ/。', { ipa: '/θɪn/' }), ex('this', '这个', '本词 th 对应 /ð/。', { ipa: '/ðɪs/' })] },
      { title: '在具体单词里找组合', text: ['先圈出一个组合，再看整词音标、听完整词。可以打开原有 /θ/ 与 /ð/ 教程看嘴形；不需要重新学一套字母名称。'] },
    ], boundary: '这里只教这些词里的对应，不是说 ch 在所有单词里永远读 /tʃ/；th 的两种声音也要在具体词中确认。', takeaway: '看共同表示声音的字母组合，再用完整词的音标和录音确认。',
    try: practice('ship 中哪段字母共同表示开头的一个声音？', ['sh', 'ip'], ['sh 共同表示开头的 /ʃ/；i 和 p 对应后面的两个声音。', 'ip 在词尾。开头的组合是 sh，合起来表示 /ʃ/。']), related: ['foundation-blending', 'foundation-sound-th', 'foundation-final-e'], source: spelling, accent: '本篇词对统一使用美式 Aria／Guy，与所列音标对应。',
  },
  {
    id: 'foundation-final-e', title: '词尾多一个 e，前面的声音怎样变', group: '拼读与拼写', sound: true, batch: 'B',
    question: 'pin 和 pine 只多一个 e，为什么听起来不同？先听词对，再找变化。',
    sections: [
      { title: '第一组：别针和松树', text: ['pin 是别针，pine 是松树。在这组词里，词尾 e 本身没有多读一个音节，前面的 i 从 /ɪ/ 变成 /aɪ/。'], examples: [ex('pin', '别针', 'i 对应 /ɪ/。', { ipa: '/pɪn/' }), ex('pine', '松树', 'i 对应滑动的 /aɪ/，词尾 e 不单独读。', { ipa: '/paɪn/' })] },
      { title: '第二组：成套工具和风筝', text: ['kit 是一套工具或用品，kite 是风筝。再听两词中的元音：这组也从 /ɪ/ 变成 /aɪ/。元音是气流通过口腔较通畅的声音。'], examples: [ex('kit', '成套工具或用品', '没有词尾 e。', { ipa: '/kɪt/' }), ex('kite', '风筝', '多一个 e；仍是一个音节。', { ipa: '/kaɪt/' })] },
      { title: '规律提供线索，还要核对实际词', text: ['have 是有，也以 e 结尾，但这里的 a 读 /æ/，不能套成 /eɪ/。不用背大量反例，遇到不确定的词，回到音标和录音。'], examples: [ex('have', '有', '这是提醒规则有边界的常见例子。', { ipa: '/hæv/' })] },
    ], boundary: '这是常见拼写对应，不是“见到末尾 e 就一定这样读”。不要求先背开音节、闭音节这些术语。', takeaway: '词尾 e 可以帮助试读；具体单词仍由音标和录音确认。',
    try: practice('本篇哪组展示了 i 从 /ɪ/ 变为 /aɪ/ 的变化？', ['pin／pine 和 kit／kite 都展示了', '只有 pin／pine，kit／kite 没变'], ['两组都从 /ɪ/ 变成 /aɪ/。词尾 e 在这些词里没有另加一个音节。', '再对照 kit 和 kite 的完整录音：它们也有这项变化。']), related: ['foundation-spelling-correspondence', 'foundation-dictionary'], source: spelling,
  },
  {
    id: 'foundation-spelling-correspondence', title: '相同声音和相同拼写，不是一回事', group: '拼读与拼写', sound: true, batch: 'B',
    question: '听到同一个声音，就一定能写出唯一拼写吗？看到 oo，就一定读同一个音吗？',
    sections: [
      { title: '不同拼写，可以有相同声音', text: ['see 是看见，sea 是海。两词读音相同，ee 与 ea 在这些词里都对应 /iː/；意义和拼写却不同。'], examples: [ex('see', '看见', '元音拼写是 ee。', { ipa: '/siː/' }), ex('sea', '海', '元音拼写是 ea，读音与 see 相同。', { ipa: '/siː/' })] },
      { title: '相同拼写，也可能读不同声音', text: ['book 是书，food 是食物。两词都有 oo；book 中是 /ʊ/，food 中是 /uː/。这不是只把同一个声音拖长：嘴形和舌位也有差别。'], examples: [ex('book', '书', 'oo 对应 /ʊ/，较放松。', { ipa: '/bʊk/' }), ex('food', '食物', 'oo 对应 /uː/，舌位和音质也变化。', { ipa: '/fuːd/' })] },
      { title: '把规律当线索，把词当核对单位', text: ['试读以后，看这个词的完整音标，再听完整词。想细听 /ʊ/ 与 /uː/，可以打开已有的易混音教程；写词时还要结合意思和语境。'] },
    ], boundary: '不能把“长音就是把短音拖长”当成通用规则；也不能仅凭听到的声音确定 see 还是 sea。', takeaway: '拼写帮助猜测，音标和录音确认读音，意思与语境帮助确认拼写。',
    try: practice('在 book 和 food 中，哪一个词的元音是 /ʊ/？', ['book', 'food'], ['book 使用 /ʊ/；food 使用 /uː/。两个词都有 oo，但读音不同。', 'food 的元音是 /uː/。请对照本篇两段完整词录音。']), related: ['foundation-sound-u', 'foundation-final-e', 'foundation-dictionary'], source: spelling,
  },
  {
    id: 'foundation-dictionary', title: '怎样查懂一个词', group: '理解与查阅', sound: false, batch: 'B',
    question: '遇到不熟悉的拼写，怎样确认读音，还能选对词的意思？',
    sections: [
      { title: '先试读，再逐步核对', text: ['先根据已经学过的对应试读 → 看词典音标 → 听同一口音的录音 → 找出与预期不同的位置 → 连成完整词再读。试读是猜测，核对才帮你确认。'], examples: [ex('have', '有', '如果只看到词尾 e 就猜成 /heɪv/，和 /hæv/ 对照后应修正中间元音。', { ipa: '/hæv/' })] },
      { title: '查音也要查意思', text: ['book 可以是书，也可以是预订。room 是房间。先看当前句子，再选相关释义和词性：n. 常表示名词，v. 表示动词，adj. 表示形容词。'], examples: [ex('a book', '一本书', 'book 在这里给东西命名。'), ex('Book a room.', '预订一个房间。', 'book 在这里说明动作。')] },
      { title: '把听到的声音反过来帮助看拼写', text: ['听完整词，再看声音对应哪段拼写；若写法不确定，结合意思查词。see 是看见，sea 是海，这两个词同音，不能只凭声音选一个。'] },
    ], boundary: '不需要新的查词产品。使用能显示音标和同口音录音的词典即可；不要永远只取第一条释义。', takeaway: '从当前语境选意思，从音标和录音确认读音，再把声音连回完整词。',
    try: practice('have 的词尾有 e，试读后最可靠的确认办法是什么？', ['看本词音标并听录音', '不核对，所有词尾 e 都套同一规律'], ['这个词的音标是 /hæv/。规则给线索，实际词条和录音帮你确认。', 'have 就是本篇的反例。回到具体词的音标和录音，修正预期。']), related: ['foundation-spelling-correspondence', 'foundation-letter-sound'], source: spelling,
  },
  {
    id: 'foundation-manner-adverbs', title: '怎样说明一个动作是怎么做的', group: '怎样补充意思', sound: false, batch: 'C',
    question: '“他说话”和“他说话很慢”，多出的“很慢”描述什么？',
    sections: [
      { title: '先有动作，再补充方式', text: ['He 是他，speaks 是说话，slowly 是缓慢地。slowly 补充 speaks 这个动作怎样进行，这类用法叫方式副词。'], examples: [ex('He speaks.', '他说话。', '先说谁做什么。'), ex('He speaks slowly.', '他说话很慢。', 'slowly 说明说话方式。', { parts: [['谁', 'He'], ['做什么', 'speaks'], ['怎样说', 'slowly']] })] },
      { title: '描述东西和描述动作，分开看', text: ['bus 是公交车，slow 是慢的，moves 是移动。a slow bus 中 slow 描述公交车；整句中的 slowly 描述它移动的方式。'], examples: [ex('a slow bus', '一辆很慢的公交车', 'slow 是形容词，描述 bus。'), ex('The bus moves slowly.', '那辆公交车缓慢移动。', 'slowly 是副词，说明 moves 怎样进行。')] },
      { title: '先理解作用，再记名称', text: ['方式副词往往在动作或其对象后面。本篇 speaks 没有接对象，所以 slowly 紧跟动作；副词描述动作时，还可称作这句的状语，也就是补充动作情况的部分。'] },
    ], boundary: '不少方式副词以 -ly 结尾，但不是所有副词都这样。不能给每个形容词机械加 -ly；位置也要看具体结构。', takeaway: '先问它描述一个东西，还是说明动作怎样进行。',
    try: practice('He speaks slowly. 中，哪个词补充“说话的方式”？', ['slowly', 'He'], ['slowly 表示缓慢地，补充 speaks 怎样进行。He 说明是谁。', 'He 说明是谁，说话方式由 slowly 补充。']), related: ['foundation-adjectives', 'foundation-word-order', 'foundation-frequency-adverbs'], source: 'https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference/where-adverbials-go-sentence',
  },
  {
    id: 'foundation-frequency-adverbs', title: '总是、经常、有时、从不放在哪里', group: '怎样补充意思', sound: false, batch: 'C',
    question: '同样是补充意思，“经常”放在 read 前，“总是”为什么又在 is 后？',
    sections: [
      { title: '先认识五个频率词', text: ['频率是在说明事情多常发生。下面几个词表达常见频率，不是固定百分比。'], examples: [ex('always', '总是', '在所说的情境里一贯如此。'), ex('usually', '通常', '多数时候如此。'), ex('often', '经常', '发生得比较频繁。'), ex('sometimes', '有时', '有一些时候如此。'), ex('never', '从不', '在所说的范围内不发生。')] },
      { title: '主要动作前，be 后', text: ['I 是我，read 是阅读，often 在这个例子中放在主要动作 read 前。She 是她，happy 是开心的，always 在这类例子中放在 be 的形式 is 后。'], examples: [ex('I often read.', '我经常阅读。', 'I → often → read。'), ex('She is always happy.', '她总是很开心。', 'She → is → always → happy。')] },
      { title: '位置有常见模式，也有变化', text: ['sometimes 还可以在句首。下方两句都是自然表达，侧重点略有不同，不必为了一个固定答案把其中一句判错。'], examples: [ex('I sometimes read.', '我有时阅读。', 'sometimes 放在主要动作前。'), ex('Sometimes I read.', '有时我会阅读。', '句首 sometimes 也自然。')] },
    ], boundary: '“主要动作前、be 后”是本批结构的常见位置，不是所有句子唯一许可的位置；频率词的意思不按固定百分比定义。', takeaway: '先看是主要动作还是 be，再参考常见位置，并留意实际表达。',
    try: practice('本篇两句 I sometimes read. 和 Sometimes I read.，怎样理解？', ['两句都可以自然表达', '只有第一句可以'], ['sometimes 可以在主要动作前，也可以在句首；两句都自然。', '主要动作前是常见位置，但句首 Sometimes I read. 也可以。']), related: ['foundation-be', 'foundation-present', 'foundation-manner-adverbs'], source: 'https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference/how-often',
  },
  {
    id: 'foundation-and-or', title: 'and 和 or 怎样连接内容', group: '怎样补充意思', sound: false, batch: 'C',
    question: '茶和牛奶都要，与从茶或牛奶里选一种，连接词怎样帮助说明？',
    sections: [
      { title: '先连接两项内容', text: ['tea 是茶，milk 是牛奶。and 在这组词中把两项并列；or 提供选择。连接词就是帮助把词、词组或句子部分接起来的词。'], examples: [ex('tea and milk', '茶和牛奶', '这里说两项内容。'), ex('tea or milk', '茶或牛奶', '这里给出选项。')] },
      { title: '放进完整句子', text: ['I 是我，want 是想要，you 是你。第一句表示我想要两项；第二句在询问选择，Do 是帮助提问的小词。'], examples: [ex('I want tea and milk.', '我想要茶和牛奶。', 'and 连接 want 的两项对象。'), ex('Do you want tea or milk?', '你想要茶还是牛奶？', '在菜单要求选一种的场景里，or 给出两种选项。')] },
    ], boundary: 'or 常提供选择，但不能把所有语境里的 or 都解释成排他二选一；这里的“选一种”来自明确的菜单场景。', takeaway: '先看当前场景是在并列内容，还是提供选择。',
    try: practice('菜单明确让你从茶和牛奶中选一种，tea ___ milk 用哪个词？', ['or', 'and'], ['这个场景用 or 提供选项；选一种来自菜单要求。', 'and 在本篇把两项并列。菜单要求选一种时用 or。']), related: ['foundation-word-order', 'foundation-but'], source: conjunctions,
  },
  {
    id: 'foundation-but', title: 'but 怎样表达转折', group: '怎样补充意思', sound: false, batch: 'C',
    question: '“我累了，但我还能工作”，后半句为什么让人感觉有转折？',
    sections: [
      { title: '先读懂两部分', text: ['I 是我，am 连接状态，tired 是累的。can 表示能够，work 是工作。先分别理解“我累了”和“我还能工作”。'], examples: [ex('I am tired.', '我累了。', '说明状态。'), ex('I can work.', '我能工作。', 'can 后直接接动作原形 work。')] },
      { title: '连接词提示前后的关系', text: ['累了可能让人预期不能继续，后面却说还能工作；but 表示这种转折。and 则可以用来普通地增加信息，看下面另一个例子。'], examples: [ex('I am tired, but I can work.', '我累了，但我还能工作。', 'but 让读者留意前后的转折。', { parts: [['前面的状态', 'I am tired'], ['转折', 'but'], ['与预期不同的信息', 'I can work']] }), ex('I read and I write.', '我阅读，也写字。', 'write 是写；and 在这里并列两件事。')] },
    ], boundary: '转折要结合句子意思和语境，不能只凭两个不同的词就认定一定要用 but。', takeaway: '分别理解前后两部分，再看后面是否改变了前面带来的预期。',
    try: practice('I am tired, but I can work. 中 but 提示怎样的关系？', ['转折：累了却还能工作', '只是列出两个物品'], ['后半句与“累了可能不能继续”的预期不同，因此有转折。', '这句谈状态与还能做的事，不是物品清单。but 提示转折。']), related: ['foundation-be', 'foundation-can', 'foundation-cause-result'], source: conjunctions,
  },
  {
    id: 'foundation-cause-result', title: 'because 和 so：原因与结果从哪里看', group: '怎样补充意思', sound: false, batch: 'C',
    question: '同一件事，可以先说停下来，也可以先说累了。原因在哪一边？',
    sections: [
      { title: 'because 后接原因', text: ['stop 是停下来，tired 是累的，because 是因为。先说停下来，再用 because 解释为什么。'], examples: [ex('I stop because I am tired.', '我停下来，因为我累了。', '原因是累了，停下来是结果。', { parts: [['结果', 'I stop'], ['引入原因', 'because'], ['原因', 'I am tired']] })] },
      { title: 'so 引出这里的结果', text: ['so 在本例表示所以。先交代累了这个原因，后面说明因此停下来。两句信息相同，但组织顺序改变了。'], examples: [ex('I am tired, so I stop.', '我累了，所以我停下来。', 'so 后是当前表达的结果。', { parts: [['原因', 'I am tired'], ['引出结果', 'so'], ['结果', 'I stop']] })] },
      { title: '不照搬中文的双重连接', text: ['本篇这种普通连接方式选 because 或 so 其中一个，不把中文“因为……所以……”逐字套成同一句里的 because…so…。还要看连接词后接的完整意思，不只是背中文译法。'] },
    ], boundary: '这里的 so 讲因果结果；它还有其他用法，留到具体情境再学。本篇不扩展整套从句。', takeaway: 'because 后找原因，so 后找本句的结果，再回看两部分的关系。',
    try: practice('在 I stop because I am tired. 中，停下来的原因是哪部分？', ['I am tired', 'I stop'], ['I am tired 表示累了，是原因；I stop 表示停下来，是结果。', 'I stop 是发生的结果；because 后的 I am tired 才说明原因。']), related: ['foundation-but', 'foundation-word-order'], source: 'https://dictionary.cambridge.org/grammar/british-grammar/conjunctions-causes-reasons-results-and-purpose',
  },
  {
    id: 'foundation-syllables', title: '音节和重音是什么', group: '从单词到整句', sound: true, batch: 'D',
    question: 'teacher 和 about 都有两个音节，为什么听起来突出的位置不同？',
    sections: [
      { title: '按声音分节拍，不按字母数', text: ['teacher 是老师。读词时，围绕元音声音形成的一个单位叫音节。teacher 可以观察为 /tiː/ 和 /tʃɚ/ 两组声音；这是声音分组，不是在规定字母换行。'], examples: [ex('teacher', '老师', '两个音节；音标 ˈ 放在第一组前，第一组较突出。', { ipa: '/ˈtiː.tʃɚ/' })] },
      { title: '重音标记在重读音节前', text: ['about 是关于，声音分为 /ə/ 与 /baʊt/。ˈ 在第二组前，表示第二组更突出。开头 /ə/ 是较轻的放松元音，不是完全消失。'], examples: [ex('about', '关于', '两个音节；第二组突出。', { ipa: '/əˈbaʊt/' })] },
      { title: '听完整词，再自己轻重对照', text: ['先分别听完整词，再用慢速留意元音的清晰度和时长。试着读时，teacher 的第一组更清楚，about 的第二组更清楚；不用大喊，也不把每个字母都发成一拍。'] },
    ], boundary: '重音不是音标里的停顿号。词重音和句子重点也不同，下一篇会把词放进整句比较。', takeaway: '按声音找音节，看 ˈ 标在哪组前，再用完整词录音确认轻重。',
    try: practice('about 的音标 /əˈbaʊt/ 中，ˈ 在提醒什么？', ['后面的音节主要重读', '这里必须停很久'], ['ˈ 标在主要重读音节前。about 的第二音节突出，不要求在此停顿。', 'ˈ 不是停顿号，它说明后面的音节主要重读。']), related: ['foundation-sentence-stress', 'foundation-weak'], source: 'https://dictionary.cambridge.org/help/phonetics.html',
  },
  {
    id: 'foundation-sentence-stress', title: '一句话里，哪些信息读得更突出', group: '从单词到整句', sound: true, batch: 'D',
    question: '同一句“我想要茶”，强调“我”和强调“茶”，听者注意到的信息会怎样变化？',
    sections: [
      { title: '先理解整句话', text: ['I 是我，want 是想要，tea 是茶。先听下方自然整句，读懂基本意思。'], examples: [ex('I want tea.', '我想要茶。', '这是原有 Aria／Guy 声线的自然整句。')] },
      { title: '强调谁：是我想要', text: ['场景：对方以为另一个人想要茶，你澄清是我。下方示范突出 I；字词和基本意思没有换。'], examples: [ex('I want tea.', '是我想要茶。', '固定美式 David 控制示范；重点在 I。', { demo: 'focus-i' })] },
      { title: '强调什么：我想要茶', text: ['场景：对方给你牛奶，你说明想要的是茶。对照同一声线的另一段示范，留意 tea 更突出。'], examples: [ex('I want tea.', '我想要的是茶。', '固定美式 David 控制示范；重点在 tea。', { demo: 'focus-tea' })] },
    ], boundary: '重点随语境变化，不是每句都固定重读最后一个词。控制示范用于放大对比；实际说话的音高和时长可以更细微。', takeaway: '先弄清要纠正或补充哪项信息，再留意它在录音里怎样突出。',
    try: practice('对方给你牛奶，你想澄清想要的是茶。这次重点应放在哪项信息？', ['tea：想要的东西', 'I：想要的人'], ['这次要纠正饮品，所以重点是 tea；听本篇第二种意图的示范。', 'I 用来澄清是谁想要；当前需要澄清的是饮品 tea。']), related: ['foundation-syllables', 'foundation-weak'], source: connected, accent: '自然整句为美式 Aria／Guy；两段重点对比统一为美式 David 控制示范。',
  },
  {
    id: 'foundation-weak', title: '为什么有些小词听起来很轻', group: '从单词到整句', sound: true, batch: 'D',
    question: '明明认识 can、a、of，放进一句话却容易漏听，发生了什么？',
    sections: [
      { title: '词仍在，只是轻重变了', text: ['can 表示能够，swim 是游泳。单独读 can 往往较完整；放进不强调能力的整句时常较轻，常见弱式是 /kən/。先比较逐词和自然整句，不能只看文字认定每位说话者都用同一弱式。'], examples: [ex('I can swim.', '我会游泳。', '自然整句；展开后可以逐词点读作对照。', { separate: true })] },
      { title: '一杯茶里也有小词', text: ['a 是这里的一，cup 是杯，of 连接杯与茶，tea 是茶。自然说这组词时，a 和 of 常较轻；a 常用 /ə/，of 常用 /əv/。'], examples: [ex('a cup of tea', '一杯茶', '听两端的小词，再听 cup 和 tea 的清晰度。', { separate: true })] },
      { title: '强调时也可能读得完整', text: ['若要强调确实“会”，can 可以更突出。逐词读用于观察每个词，不能把它冒充自然语流。先听整句，再开逐词区，最后回到整句跟读。'] },
    ], boundary: '弱读不是把没有作用的词删除；这些词仍有语法和意义作用。不同语境和声线的具体弱化程度会变化。', takeaway: '认识词后，还要听它在整句中的实际轻重，结合意思补回词边界。',
    try: practice('自然句里 can 听起来轻，是不是说明这个词可以随意删掉？', ['不是，它仍表达能力', '是，它没有意思'], ['can 仍表达能够，轻读不等于删除。强调时它还可以读得更完整。', '删掉 can 会改变意思。它读得轻，仍然有作用。']), related: ['foundation-can', 'foundation-sentence-stress', 'foundation-linking'], source: connected,
  },
  {
    id: 'foundation-linking', title: '相邻的声音怎样连接', group: '从单词到整句', sound: true, batch: 'D',
    question: '逐个听懂 pick、it、up，为什么整句又像连成了一串？',
    sections: [
      { title: '先听自然句，再分开比较', text: ['pick 是捡起，it 是它，up 在这个搭配里和 pick 一起表示拿起。自然整句保持相邻声音的过渡；逐词区把词边界分开，方便观察。'], examples: [ex('Pick it up.', '把它捡起来。', '观察标记：pick‿it‿up；正常拼写仍是有空格的完整句。', { separate: true })] },
      { title: '听的是实际声音，不是字母', text: ['在不特别停顿的语流里，pick 末尾 /k/ 可接后面的元音；it 末尾 /t/ 接 up。美式 /t/ 在这类位置还可能带轻拍变化，不必强行发三个完全分开的词。'], examples: [ex('Turn it on.', '把它打开。', 'turn 是转动，turn…on 在这里是打开；观察 turn‿it‿on。', { separate: true })] },
      { title: '最后回到整句', text: ['逐词听完，再点自然整句，留意哪里不再停下来。先正常听，再用整句慢速帮助分辨；目标是衔接清楚，不是越快越好。'] },
    ], boundary: '连接线只辅助观察，不改变拼写，也不表示每次都必须连。实际发音、语境和停顿决定衔接方式。', takeaway: '先听整句的连续声音，再借逐词对照找边界，最后连回整句。',
    try: practice('判断一处是否自然连接，主要看什么？', ['相邻的实际声音和停顿', '最后一个字母的外形'], ['字母和声音不总一一对应。听实际声音，并考虑句子里有没有停顿。', '字母只是拼写线索，判断连接要看实际声音与停顿。']), related: ['foundation-weak', 'foundation-intonation'], source: connected,
  },
  {
    id: 'foundation-intonation', title: '停顿和语调怎样帮助理解', group: '从单词到整句', sound: true, batch: 'D',
    question: '同样的短句，在哪里停、声音往哪里走，怎样帮助听者理解？',
    sections: [
      { title: '先听一个询问', text: ['Are you 是你是否，ready 是准备好的。语调是说话时声音高低的走向；询问是否准备好时，可以听到与回答不同的走向。'], examples: [ex('Are you ready?', '你准备好了吗？', '先听自然询问，再与下方回答比较。', { separate: true })] },
      { title: '回答按意思成组', text: ['Yes 是是的，I am ready 是我准备好了。Yes 可以先回应，再以后一组补充；按意思形成的声音小组叫意群。'], examples: [ex('Yes, I am ready.', '是的，我准备好了。', '可观察 Yes｜I am ready 的意思分组；竖线是辅助标记。', { separate: true })] },
      { title: '明确停顿的对照示范', text: ['下面用同一美式声线分别示范连续回答与 Yes 后停一下。后一段插入明确的短停顿，让两组意思更容易比较；日常停顿不需要每次都这么明显。'], examples: [ex('Yes, I am ready.', '连续回答', '固定美式 David 控制示范。', { demo: 'ready-flow' }), ex('Yes, I am ready.', '先回应，再补充', '同一声线；Yes 后有明确短停顿。', { demo: 'ready-pause' })] },
    ], boundary: '不是所有问句都必须升调，也不是陈述句永远只用一种降调；语调还会随态度与语境变化。不要在每个词后机械停顿。', takeaway: '先按完整意思分组，再听自然声音的走向和停顿。',
    try: practice('Yes｜I am ready 的分组，为什么比每词都停一下更有帮助？', ['先回应，再保留完整的准备状态', '每个单词都必须是一个意群'], ['Yes 先回应，I am ready 保留完整意思。意群按意思分，不按单词数分。', '意群不是一个词一组；I am ready 可以作为一组表达完整状态。']), related: ['foundation-linking', 'foundation-be-question'], source: connected, accent: '自然问答使用美式 Aria／Guy；明确停顿对比统一使用美式 David。',
  },
  {
    id: 'foundation-endings', title: 's 和 ed 为什么有不同读音', group: '常见词尾', sound: true, batch: 'D',
    question: '都是词尾 s 或 ed，为什么有时多出一拍，有时没有？',
    sections: [
      { title: '复数 s：听前一个声音', text: ['cat 是猫，dog 是狗，bus 是公交车，复数表示不止一个。/s/、/z/ 等摩擦类声音之后，复数常读 /ɪz/；其他清辅音之后常读 /s/，元音或其他浊辅音之后常读 /z/。清音不加声带振动，浊音有振动。先用这三词比较。'], examples: [ex('cats', '多只猫', '/t/ 后接 /s/，没有多一个音节。', { ipa: '/kæts/' }), ex('dogs', '多只狗', '/ɡ/ 后接 /z/；这里列美式读法，元音有口音差异。', { ipa: '/dɑːɡz/' }), ex('buses', '多辆公交车', '/s/ 后接 /ɪz/，多一个音节。', { ipa: '/ˈbʌs.ɪz/' })] },
      { title: '规则过去式 ed：也听前一个声音', text: ['walk 是走路，play 是玩，want 是想要。下方 -ed 是规则动词的过去形式：/t/ 或 /d/ 后常读 /ɪd/；其他清辅音后读 /t/，元音或其他浊辅音后读 /d/。'], examples: [ex('walked', '走过', 'walk 末尾是 /k/，-ed 读 /t/，仍一个音节。', { ipa: '/wɑːkt/' }), ex('played', '玩过', 'play 末尾是元音，-ed 读 /d/，仍一个音节。', { ipa: '/pleɪd/' }), ex('wanted', '曾想要', 'want 末尾是 /t/，-ed 读 /ɪd/，多一个音节。', { ipa: '/ˈwɑːn.tɪd/' })] },
      { title: '发音与语法，各看一件事', text: ['复数和过去式解释这些词形的用途；本篇看词尾实际怎么读。先听每组完整词，再比较末尾有没有多出的元音，不把字母 S 或 E、D 的名称读出来。'] },
    ], boundary: '规则依据前一个声音，不只依据最后一个字母。这里讲规则过去式，不表示所有过去形式都加 ed；/ɪz/、/ɪd/ 的弱元音也可能有口音变化。', takeaway: '看词形在表达什么，再听前一声音，比较词尾和音节是否变化。',
    try: practice('与 walked、played 相比，本篇 wanted 的 -ed 带来什么？', ['多一个音节，常读 /ɪd/', '只读字母 D 的名称'], ['want 以 /t/ 结尾，-ed 常读 /ɪd/，因此多一个音节。', '词尾不是字母名；wanted 的 -ed 常读 /ɪd/，多一个音节。']), related: ['foundation-syllables', 'foundation-plural', 'foundation-past'], source: 'https://dictionary.cambridge.org/help/phonetics.html',
  },
];

export const tutorialExamples = foundationTutorials.flatMap(item => item.sections.flatMap(section => section.examples ?? []));
