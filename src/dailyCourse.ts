/** Original, bilingual course material. Programming vocabulary and its IDs stay separate. */
export type DailyPhrase = { id: string; en: string; zh: string; note?: string }

export type DailyExercise = {
  id: string
  kind: 'choice' | 'listen' | 'order' | 'fill' | 'write' | 'speak'
  prompt: string
  explanation: string
  audioId?: string
  options?: string[]
  answers?: string[]
  parts?: string[]
  blanks?: string[][]
  sample?: string
  checks?: string[]
  readAloud?: DailyPhrase[]
}

export type DailyLesson = {
  id: string
  title: string
  goal: string
  explanation: string
  phrases: DailyPhrase[]
  exercises: DailyExercise[]
  rechecks: DailyExercise[]
}

export type DailyUnit = {
  id: string
  title: string
  goal: string
  description: string
  lessons: DailyLesson[]
}

type ExerciseDraft = Omit<DailyExercise, 'id'>
const phraseBank: Record<string, DailyPhrase> = {}
const p = (id: string, en: string, zh: string, note?: string): DailyPhrase => {
  const phrase = { id, en, zh, ...(note ? { note } : {}) }
  phraseBank[id] = phrase
  return phrase
}

// Each phrase ID is also the stable name of its separate daily-course recording.
const P = {
  hello: p('hello', 'Hello!', '你好！', '见面时使用；开头的 h 轻轻呼气。'),
  hi: p('hi', 'Hi!', '嗨！', '较随意的问候，与 Hello 都可用于见面。'),
  goodbye: p('goodbye', 'Goodbye!', '再见！', '离开时使用。'),
  bye: p('bye', 'Bye!', '再见！', '较随意的告别。'),
  ben: p('i-am-ben', 'I am Ben.', '我叫 Ben。', 'I 表示“我”，与 am 连用。Ben 是姓名。'),
  mia: p('i-am-mia', 'I am Mia.', '我叫 Mia。'),
  benShort: p('im-ben', "I'm Ben.", '我叫 Ben。', "I'm 是 I am 的缩写，意思相同。"),
  miaShort: p('im-mia', "I'm Mia.", '我叫 Mia。'),
  nameQuestion: p('whats-your-name', "What's your name?", '你叫什么名字？', '先把这句当作完整表达；What’s 是 What is。'),
  nameBen: p('my-name-is-ben', 'My name is Ben.', '我的名字是 Ben。', 'My name is ... 后接姓名。'),
  nameMia: p('my-name-is-mia', 'My name is Mia.', '我的名字是 Mia。'),
  areBen: p('are-you-ben', 'Are you Ben?', '你是 Ben 吗？', 'you 表示“你”；确认对方身份时，用 Are you ...?'),
  areMia: p('are-you-mia', 'Are you Mia?', '你是 Mia 吗？'),
  yesIAm: p('yes-i-am', 'Yes, I am.', '是的，我是。', '肯定简短回答保留 am，不缩成 Yes, I’m。'),
  noBen: p('no-im-ben', "No, I'm Ben.", '不是，我是 Ben。'),
  noMia: p('no-im-mia', "No, I'm Mia.", '不是，我是 Mia。'),
  meetMia: p('meet-mia', "Hello! I'm Mia. What's your name?", '你好！我叫 Mia。你叫什么名字？'),
  meetBen: p('meet-ben', "Hi! My name is Ben. Are you Mia?", '嗨！我的名字是 Ben。你是 Mia 吗？'),
  china: p('from-china', 'I am from China.', '我来自中国。', 'from 表示“来自”；China 是国家名称，首字母大写。'),
  japan: p('from-japan', 'I am from Japan.', '我来自日本。'),
  us: p('from-the-us', 'I am from the US.', '我来自美国。', 'the US 表示美国；这里保留 the。'),
  whereFrom: p('where-are-you-from', 'Where are you from?', '你来自哪里？', 'where 询问地点；问句把 are 放在 you 前。'),
  areFromChina: p('are-you-from-china', 'Are you from China?', '你来自中国吗？'),
  areFromJapan: p('are-you-from-japan', 'Are you from Japan?', '你来自日本吗？'),
  notJapan: p('not-from-japan', 'I am not from Japan.', '我不是来自日本。', '否定时，在 am 后加 not。'),
  notChina: p('not-from-china', 'I am not from China.', '我不是来自中国。'),
  noIAmNot: p('no-im-not', "No, I'm not.", '不，我不是。', '也可以说 No, I am not.。'),
  chinese: p('i-am-chinese', 'I am Chinese.', '我是中国人。', 'Chinese 这里表示国籍；不加 from。'),
  japanese: p('i-am-japanese', 'I am Japanese.', '我是日本人。'),
  american: p('i-am-american', 'I am American.', '我是美国人。'),
  areChinese: p('are-you-chinese', 'Are you Chinese?', '你是中国人吗？'),
  areJapanese: p('are-you-japanese', 'Are you Japanese?', '你是日本人吗？'),
  noJapanese: p('no-im-japanese', "No, I'm Japanese.", '不是，我是日本人。'),
  noChinese: p('no-im-chinese', "No, I'm Chinese.", '不是，我是中国人。'),
  originBen: p('origin-ben', "Hello! I'm Ben. I'm from China.", '你好！我叫 Ben。我来自中国。'),
  originMia: p('origin-mia', "Hi! My name is Mia. I'm from Japan.", '嗨！我的名字是 Mia。我来自日本。'),
  heBen: p('he-is-ben', 'He is Ben.', '他是 Ben。', 'he 表示“他”，与 is 连用。不要只凭姓名判断代词。'),
  sheMia: p('she-is-mia', 'She is Mia.', '她是 Mia。', 'she 表示“她”，与 is 连用。'),
  heChina: p('he-is-from-china', 'He is from China.', '他来自中国。'),
  sheJapan: p('she-is-from-japan', 'She is from Japan.', '她来自日本。'),
  student: p('i-am-a-student', 'I am a student.', '我是一名学生。', 'student 是学生；单数身份表达先一起学 a student。'),
  teacher: p('i-am-a-teacher', 'I am a teacher.', '我是一名老师。'),
  heTeacher: p('he-is-a-teacher', 'He is a teacher.', '他是一名老师。'),
  sheStudent: p('she-is-a-student', 'She is a student.', '她是一名学生。'),
  weStudents: p('we-are-students', 'We are students.', '我们是学生。', 'we 表示“我们”；students 表示不止一名学生，前面不加 a。'),
  theyTeachers: p('they-are-teachers', 'They are teachers.', '他们是老师。', 'they 可指“他们／她们”；与 are 连用。'),
  theyStudents: p('they-are-students', 'They are students.', '他们是学生。'),
  weTeachers: p('we-are-teachers', 'We are teachers.', '我们是老师。'),
  happy: p('i-am-happy', 'I am happy.', '我很高兴。', 'happy 是描述状态的形容词，前面不加 a。'),
  tired: p('i-am-tired', 'I am tired.', '我累了。', 'tired 表示“累的”。'),
  sheHappy: p('she-is-happy', 'She is happy.', '她很高兴。'),
  heTired: p('he-is-tired', 'He is tired.', '他累了。'),
  theyHappy: p('they-are-happy', 'They are happy.', '他们很高兴。'),
  whoHe: p('who-is-he', 'Who is he?', '他是谁？', 'who 询问人；不是询问地点。'),
  whoShe: p('who-is-she', 'Who is she?', '她是谁？'),
  isHeTeacher: p('is-he-a-teacher', 'Is he a teacher?', '他是老师吗？'),
  isSheStudent: p('is-she-a-student', 'Is she a student?', '她是学生吗？'),
  yesHe: p('yes-he-is', 'Yes, he is.', '是的，他是。'),
  noShe: p('no-she-isnt', "No, she isn't.", '不，她不是。', "isn't = is not。"),
  benIntro: p('ben-introduction', 'He is Ben. He is from China. He is a teacher.', '他是 Ben。他来自中国。他是老师。'),
  miaIntro: p('mia-introduction', 'She is Mia. She is from Japan. She is a student.', '她是 Mia。她来自日本。她是学生。'),
  whatIt: p('what-is-it', 'What is it?', '它是什么？', 'it 这里指一件物品。'),
  book: p('it-is-a-book', 'It is a book.', '它是一本书。', 'book 是书；It is 可以缩写为 It’s。'),
  pen: p('it-is-a-pen', 'It is a pen.', '它是一支笔。'),
  bag: p('it-is-a-bag', 'It is a bag.', '它是一个包。'),
  apple: p('it-is-an-apple', 'It is an apple.', '它是一个苹果。', 'apple 以元音音素开头，前面用 an。a / an 看发音，不只看字母。'),
  egg: p('it-is-an-egg', 'It is an egg.', '它是一个鸡蛋。'),
  thisBook: p('this-is-a-book', 'This is a book.', '这是一本书。', 'this 指近处的一件物品。'),
  thatBag: p('that-is-a-bag', 'That is a bag.', '那是一个包。', 'that 指较远处的一件物品。'),
  thisPen: p('this-is-a-pen', 'This is a pen.', '这是一支笔。'),
  thatBook: p('that-is-a-book', 'That is a book.', '那是一本书。'),
  books: p('they-are-books', 'They are books.', '它们是书。', 'book → books；这些规则复数在词尾加 s，前面不用 a / an。'),
  pens: p('they-are-pens', 'They are pens.', '它们是笔。', 'they 也可指“它们”；单数 It is，复数 They are。'),
  apples: p('they-are-apples', 'They are apples.', '它们是苹果。'),
  theseBooks: p('these-are-books', 'These are books.', '这些是书。', 'these 指近处多件物品，和 are 连用。'),
  thosePens: p('those-are-pens', 'Those are pens.', '那些是笔。', 'those 指较远处多件物品，和 are 连用。'),
  theseApples: p('these-are-apples', 'These are apples.', '这些是苹果。'),
  thoseBooks: p('those-are-books', 'Those are books.', '那些是书。'),
  whatThis: p('what-is-this', 'What is this?', '这是什么？'),
  isThatBag: p('is-that-a-bag', 'Is that a bag?', '那是一个包吗？'),
  yesIt: p('yes-it-is', 'Yes, it is.', '是的，它是。'),
  noIt: p('no-it-isnt', "No, it isn't.", '不，它不是。'),
  objects: p('objects-together', 'This is a book. That is a bag. These are pens.', '这是一本书。那是一个包。这些是笔。'),
}

const choice = (prompt: string, options: string[], answer: string, explanation: string): ExerciseDraft =>
  ({ kind: 'choice', prompt, options, answers: [answer], explanation })
const listen = (phrase: DailyPhrase, prompt: string, options: string[], answer: string, explanation: string): ExerciseDraft =>
  ({ kind: 'listen', audioId: phrase.id, prompt, options, answers: [answer], explanation })
const order = (phrase: DailyPhrase, prompt: string, options: string[], explanation: string): ExerciseDraft =>
  ({ kind: 'order', audioId: phrase.id, prompt, options, answers: [phrase.en], explanation })
const fill = (phrase: DailyPhrase, prompt: string, parts: string[], blanks: string[][], explanation: string): ExerciseDraft =>
  ({ kind: 'fill', audioId: phrase.id, prompt, parts, blanks, explanation })
const write = (phrase: DailyPhrase, prompt: string, explanation: string, alternatives: string[] = []): ExerciseDraft =>
  ({ kind: 'write', audioId: phrase.id, prompt, answers: [phrase.en, ...alternatives], explanation })
const speak = (phrase: DailyPhrase, prompt: string, checks: string[], explanation: string): ExerciseDraft =>
  ({ kind: 'speak', audioId: phrase.id, prompt, sample: phrase.en, checks, explanation })

function lesson(
  id: string, title: string, goal: string, explanation: string, phrases: DailyPhrase[],
  exercises: ExerciseDraft[], rechecks: ExerciseDraft[],
): DailyLesson {
  // A referenced recording is always included in the lesson's learnable material.
  const allPhrases = new Map(phrases.map(phrase => [phrase.id, phrase]))
  for (const exercise of [...exercises, ...rechecks]) {
    if (exercise.audioId) {
      const phrase = phraseBank[exercise.audioId]
      if (!phrase) throw new Error(`Unknown daily audio phrase: ${exercise.audioId}`)
      allPhrases.set(phrase.id, phrase)
    }
  }
  return {
    id, title, goal, explanation, phrases: [...allPhrases.values()],
    exercises: exercises.map((exercise, index) => ({ ...exercise, id: `${id}-e${String(index + 1).padStart(2, '0')}` })),
    rechecks: rechecks.map((exercise, index) => ({ ...exercise, id: `${id}-r${String(index + 1).padStart(2, '0')}` })),
  }
}

export const dailyUnits: DailyUnit[] = [
  {
    id: 'A1-01', title: '打招呼与姓名', goal: '听懂姓名，完成一次简短见面对话。',
    description: '从问候开始，逐步说出姓名、询问姓名和确认身份。',
    lessons: [
      lesson('A1-01-01', '见面与告别', '分清见面时和离开时说的话。',
        'Hello 和 Hi 用于问候，Goodbye 和 Bye 用于告别。同一场景可能有不同的自然说法；练习会明确要辨认的词。先点读，再跟着说一次。',
        [P.hello, P.hi, P.goodbye, P.bye], [
          choice('刚见到朋友，下面哪句是在问候？', ['Goodbye!', 'Hello!', 'Bye!'], 'Hello!', 'Hello 用于见面；Goodbye 和 Bye 用于告别。'),
          listen(P.goodbye, '听录音，选择你听到的表达。', ['Hi!', 'Goodbye!', 'Hello!'], 'Goodbye!', '录音是 Goodbye，意思是“再见”。'),
          fill(P.hello, '补完整“你好”：Hello。这里只补缺少的字母。', ['Hel', '!'], [['lo']], 'Hello 的完整拼写是 h-e-l-l-o，这里缺少 lo。'),
          write(P.hi, '写出较短的问候“Hi”。', 'Hi 是简短的问候，句末感叹号不是判题重点。'),
          speak(P.hello, '想象你刚见到朋友：先问候，再说一句告别。', ['说出了 Hello 或 Hi。', '说出了 Goodbye 或 Bye。'], '请自己听是否把问候和告别区分开；这里不自动评价发音。'),
        ], [
          listen(P.bye, '换一个表达：录音是在做什么？', ['见面问候', '离开告别', '介绍姓名'], '离开告别', 'Bye 是告别，不是在介绍姓名。'),
          fill(P.goodbye, '用较长的告别词说“再见”：先保留 Good，补出后半段。', ['Good', '!'], [['bye']], 'Goodbye 的后半段是 bye。第一课先补短片段，后面再独立回忆完整表达。'),
        ]),
      lesson('A1-01-02', '说出自己的姓名', '用 I am 或 I’m 介绍姓名。',
        '介绍自己可以说 I am + 姓名，口语中常缩成 I’m + 姓名。I 总是大写，姓名也以大写字母开头。本课用 Ben 和 Mia 两个练习姓名。',
        [P.ben, P.mia, P.benShort, P.miaShort], [
          listen(P.miaShort, '听录音，说话的人叫什么？', ['Ben', 'Mia', '没有说姓名'], 'Mia', 'I’m Mia 表示“我叫 Mia”。'),
          choice('I’m Ben. 和哪句意思相同？', ['I am Ben.', 'I am Mia.', 'Goodbye!'], 'I am Ben.', 'I’m 是 I am 的缩写，不改变姓名。'),
          order(P.ben, '用给出的词组成“我叫 Ben”。', ['Ben.', 'am', 'I'], '主语 I 在前，后接 am 和姓名。'),
          fill(P.mia, '补全“我叫 Mia”。', ['I ', ' Mia.'], [['am']], 'I am Mia 与 I’m Mia 都正确；这里填 am、’m 或省略撇号的 m 都接受。'),
          write(P.benShort, '完整写出“我叫 Ben”，可用缩写。', 'I’m Ben、I am Ben 和 My name is Ben 都可以介绍姓名。', ['I am Ben.', 'My name is Ben.']),
        ], [
          order(P.mia, '换一个姓名：组成“我叫 Mia”。', ['am', 'Mia.', 'I'], '姓名改变后，I am 的结构不变。'),
          write(P.miaShort, '写出“我叫 Mia”，可用缩写。', 'I am Mia、I’m Mia 和 My name is Mia 都可以介绍姓名。', ['I am Mia.', 'My name is Mia.']),
        ]),
      lesson('A1-01-03', '询问对方姓名', '听懂姓名问题，并使用另一种自我介绍。',
        'What’s your name? 用来问“你叫什么名字”。回答可以用 I’m ...，也可以用 My name is ...。这里先理解整个问句，不需要一次学完所有疑问句规则。',
        [P.nameQuestion, P.nameBen, P.nameMia], [
          choice('你想询问对方姓名，应选择哪句？', ['My name is Ben.', "What's your name?", 'Goodbye!'], "What's your name?", 'What’s your name? 询问姓名；My name is Ben 是在回答姓名。'),
          listen(P.nameMia, '听录音，选择说话人提供的信息。', ['姓名是 Ben', '姓名是 Mia', '正在告别'], '姓名是 Mia', 'My name is Mia 表示“我的名字是 Mia”。'),
          order(P.nameBen, '组成“我的名字是 Ben”。', ['is', 'Ben.', 'My', 'name'], 'My name 是“我的名字”，后面使用 is，再接姓名。'),
          fill(P.nameMia, '补全“我的名字是 Mia”。', ['My ', ' is Mia.'], [['name']], 'name 表示名字；My name is ... 是一个完整介绍结构。'),
          speak(P.nameQuestion, '先问对方姓名，再用自己的姓名回答一遍。', ['说出了 What’s your name?。', '用 I’m ... 或 My name is ... 回答。'], '回答时替换成你的真实姓名；示例只示范问法，不把固定姓名当作正确答案。'),
        ], [
          write(P.nameQuestion, '完整写出“你叫什么名字？”。', 'What’s your name? 和 What is your name? 都可以。', ['What is your name?']),
          fill(P.nameBen, '补全“我的名字是 Ben”。', ['My name ', ' Ben.'], [['is']], '主语 My name 与 is 连用。'),
        ]),
      lesson('A1-01-04', '确认有没有认错人', '用 Are you ...? 确认对方身份。',
        'Are you Mia? 是在确认“你是 Mia 吗”。对时回答 Yes, I am.；认错时可以说 No, I’m Ben.，同时告诉对方正确姓名。注意问句里的 you 与回答里的 I。',
        [P.areMia, P.areBen, P.yesIAm, P.noBen, P.noMia], [
          choice('你叫 Ben。对方问 Are you Mia?，哪句回答符合你的姓名？', ['Yes, I am.', "No, I'm Ben.", "No, I'm Mia."], "No, I'm Ben.", '对方认错了，所以先说 No，再介绍自己是 Ben。'),
          listen(P.areBen, '听录音，对方想确认什么？', ['你是不是 Ben', '你是不是 Mia', '你是否要告别'], '你是不是 Ben', 'Are you Ben? 是确认对方是不是 Ben。'),
          fill(P.areMia, '补全“你是 Mia 吗？”。', ['', ' you Mia?'], [['Are']], '确认对方身份，把 Are 放在 you 前。'),
          order(P.yesIAm, '你确实是对方要找的人，组成简短的肯定回答。', ['am.', 'Yes,', 'I'], '肯定简短回答是 Yes, I am，不能把句末 I am 缩成 I’m。'),
          speak(P.noBen, '扮演 Ben：对方问 Are you Mia?，开口纠正姓名。', ['先否定对方的猜测。', '告诉对方你是 Ben。'], '可以说 No, I’m Ben，也可以说 No, I am Ben。'),
        ], [
          write(P.areBen, '完整写出“你是 Ben 吗？”。', '问句用 Are you + 姓名。'),
          choice('这次你叫 Mia。对方问 Are you Ben?，哪句符合情境？', ["No, I'm Mia.", 'Yes, I am.', "No, I'm Ben."], "No, I'm Mia.", '姓名是 Mia，要否定 Ben 并给出 Mia。'),
        ]),
      lesson('A1-01-05', '不看提示回忆姓名表达', '从选词过渡到独立写出姓名句。',
        '这一课没有新句型。先辨认 I am、My name is，再补空，最后独立写句子。多空题按 Tab 移到下一个空，Shift+Tab 返回；不需要每次用鼠标。',
        [P.ben, P.miaShort, P.nameMia, P.nameQuestion], [
          choice('选出表示“我的名字是 Mia”的完整句子。', ['My name am Mia.', 'My name is Mia.', 'My name are Mia.'], 'My name is Mia.', 'My name 是单数，使用 is。不要把 I am 中的 am 套到所有主语上。'),
          order(P.nameQuestion, '排列姓名问句。', ['name?', 'your', "What's"], 'What’s 后面接 your name。'),
          fill(P.nameMia, '补全两处：“我的名字是 Mia”。', ['My ', ' ', ' Mia.'], [['name'], ['is']], 'name 表示名字；My name 后接 is。'),
          write(P.ben, '撤去词块：完整写出“我叫 Ben”，可以缩写。', 'I am Ben、I’m Ben 和 My name is Ben 都可以。', ["I'm Ben.", 'My name is Ben.']),
          speak(P.miaShort, '先用练习姓名 Mia 说一遍，再替换为自己的姓名。', ['使用 I am 或 I’m。', '姓名前没有多加 is。'], 'I’m 已经包含 am；不要说 I’m is Mia。'),
        ], [
          fill(P.ben, '换成 I 开头，补全“我叫 Ben”。', ['I ', ' ', '.'], [['am'], ['Ben']], 'I 后使用 am，再接姓名 Ben。'),
          listen(P.nameBen, '不看字幕听录音：说话人叫什么？', ['Mia', 'Ben', '没有说'], 'Ben', 'My name is Ben 提供的姓名是 Ben。'),
        ]),
      lesson('A1-01-06', '完成见面对话', '把问候、介绍、询问和告别连起来。',
        '综合使用已经学过的句子。先听出对方姓名，再回答和询问。开放任务只做自查，不把自己的姓名与示例姓名不一致判成错误。',
        [P.meetMia, P.meetBen, P.goodbye], [
          listen(P.meetMia, '听完整录音：对方叫什么，随后问了什么？', ['叫 Mia，询问你的姓名', '叫 Ben，确认你是不是 Mia', '叫 Mia，向你告别'], '叫 Mia，询问你的姓名', 'I’m Mia 介绍姓名；What’s your name? 随后询问你。'),
          fill(P.nameBen, '扮演 Ben，回答姓名问题。', ['My ', ' is ', '.'], [['name'], ['Ben']], '姓名问题可以回答 My name is Ben。'),
          order(P.areMia, '接着确认“你是 Mia 吗？”。', ['Mia?', 'you', 'Are'], 'Are you Mia? 确认刚听到的姓名。'),
          write(P.goodbye, '对话结束，用较长的告别词说“再见”。', 'Goodbye 是这里指定的较长告别词。'),
          speak(P.meetBen, '用自己的姓名完成一小段见面对话；然后写在纸上或心中复述。', ['先问候，再介绍自己的姓名。', '问一次对方姓名或确认身份。', '能在不看示例时说出主要句子。'], '示例只是一个版本。姓名可以不同；无需模仿示例中的每一个词。'),
        ], [
          write(P.nameMia, '换位练习：用 My name 开头写“我的名字是 Mia”。', 'My name is Mia；这里特意练 My name is 结构。'),
          listen(P.meetBen, '换一位说话人：录音中的人叫什么？', ['Mia', 'Ben', '没有介绍'], 'Ben', 'My name is Ben 是他的自我介绍；后面的 Mia 是在询问对方。'),
        ]),
    ],
  },
  {
    id: 'A1-02', title: '来自哪里', goal: '介绍来源，询问对方，并纠正误解。',
    description: '区分地点和国籍，把已学姓名对话扩展为简单个人介绍。',
    lessons: [
      lesson('A1-02-01', '说出来自哪里', '用 I am from ... 介绍来源。',
        '在 I am 后加 from 和地点，就能说“我来自哪里”。本课学习 China（中国）、Japan（日本）、the US（美国）。国家名称大写；the US 中的 the 不省略。',
        [P.china, P.japan, P.us], [
          choice('I am from China. 提供的是什么信息？', ['我的名字', '我来自中国', '我正在告别'], '我来自中国', 'from 后面跟来源地点；这里是 China。'),
          listen(P.japan, '听录音，说话人来自哪里？', ['中国', '美国', '日本'], '日本', 'Japan 是日本。'),
          order(P.china, '组成“我来自中国”。', ['China.', 'from', 'I', 'am'], '顺序是 I am from + 地点。'),
          fill(P.us, '补全“我来自美国”，保留句中已经给出的 the。', ['I am ', ' the ', '.'], [['from'], ['US', 'USA', 'U.S.', 'U.S.A.', 'United States', 'United States of America']], '可以说 the US、the USA 或 the United States；from 表示来自。'),
          speak(P.china, '用已学地点练习介绍来源，再换成适合自己的地点。', ['说出了 I am from 或 I’m from。', 'from 后接地点，而不是姓名。'], '自己的地点不在词表中也可以先查写法；开放任务不使用固定地点自动评分。'),
        ], [
          write(P.japan, '完整写出“我来自日本”，可用缩写。', 'I am from Japan 与 I’m from Japan 都正确。', ["I'm from Japan."]),
          listen(P.us, '再听一段来源介绍，选择地点。', ['美国', '中国', '日本'], '美国', 'the US 表示美国。'),
        ]),
      lesson('A1-02-02', '询问来源', '区分“来自哪里”与“是否来自某地”。',
        'Where are you from? 是开放地询问来源；Are you from China? 是确认一个具体地点。回答来源时仍可用 I am from ...。',
        [P.whereFrom, P.areFromChina, P.areFromJapan], [
          choice('你还不知道对方来自哪个地方，应怎样问？', ['Where are you from?', 'Are you from China?', 'My name is Ben.'], 'Where are you from?', 'Where 直接询问地点；Are you from China? 只是在确认中国。'),
          listen(P.areFromJapan, '听录音，问句在确认哪个地点？', ['中国', '日本', '美国'], '日本', 'Are you from Japan? 询问对方是否来自日本。'),
          order(P.whereFrom, '组成“你来自哪里？”。', ['from?', 'you', 'Where', 'are'], 'Where 开头，后接 are you from。'),
          fill(P.areFromChina, '补全“你来自中国吗？”。', ['', ' you ', ' China?'], [['Are'], ['from']], '确认来源，用 Are you from + 地点。'),
          write(P.whereFrom, '不看词块，写出“你来自哪里？”。', '问句顺序是 Where are you from?，不是 Where you are from?。'),
        ], [
          order(P.areFromJapan, '换个地点：组成“你来自日本吗？”。', ['Japan?', 'from', 'Are', 'you'], '问句仍以 Are you 开头。'),
          listen(P.whereFrom, '听问句，下面哪项是对问题的直接回答？', ['I am from China.', 'My name is Ben.', 'Goodbye!'], 'I am from China.', 'Where 询问地点，直接回答来源。'),
        ]),
      lesson('A1-02-03', '说清不是来自哪里', '用 not 否定，并作简短回答。',
        'I am not from Japan. 表示“我不是来自日本”。not 放在 am 后。别人问 Are you ...? 时，肯定用 Yes, I am.，否定用 No, I’m not.。',
        [P.notJapan, P.notChina, P.noIAmNot, P.yesIAm], [
          listen(P.notJapan, '听录音，哪项是确定的信息？', ['说话人来自日本', '说话人不是来自日本', '说话人来自美国'], '说话人不是来自日本', 'not 是否定；录音没有说明实际来自哪个国家。'),
          choice('你来自中国。对方问 Are you from Japan?，哪句简短回答正确？', ['Yes, I am.', "No, I'm not.", 'Goodbye!'], "No, I'm not.", '情境说明不是来自日本，所以用否定回答。'),
          order(P.notChina, '组成“我不是来自中国”。', ['from', 'I', 'China.', 'not', 'am'], 'I am 后先加 not，再接 from China。'),
          fill(P.notJapan, '补全“我不是来自日本”。', ['I ', ' ', ' from Japan.'], [['am'], ['not']], '否定顺序是 I am not。'),
          write(P.noIAmNot, '用简短回答表示“不，我不是”。', 'No, I’m not 与 No, I am not 都可以。', ['No, I am not.']),
        ], [
          fill(P.notChina, '换一个地点，补出否定词。', ['I am ', ' from China.'], [['not']], 'not 在 am 后、from 前。'),
          speak(P.notJapan, '假设你来自中国：先说明不是来自日本，再说出实际来源。', ['先说 I am not from Japan。', '再说 I am from China。'], '两句都可将 I am 缩为 I’m；否定与实际来源要一致。'),
        ]),
      lesson('A1-02-04', '地点和国籍', '区分 China 与 Chinese 等表达。',
        'I am from China. 介绍来源地点；I am Chinese. 表示国籍。类似地，Japan 对应 Japanese，the US 对应 American。Chinese、Japanese、American 可直接接在 am 后；American 也可作名词，说 I am an American。',
        [P.chinese, P.japanese, P.american], [
          choice('下面哪句表示“我是中国人”？', ['I am from Chinese.', 'I am Chinese.', 'I am China.'], 'I am Chinese.', 'Chinese 是国籍表达；China 是国家名称。'),
          listen(P.american, '听录音，说话人介绍了哪一种国籍？', ['中国人', '日本人', '美国人'], '美国人', 'American 在这里表示美国人。'),
          order(P.japanese, '组成“我是日本人”。', ['Japanese.', 'I', 'am'], '国籍表达直接接在 I am 后。'),
          fill(P.chinese, '补全“我是中国人”，使用国籍词。', ['I am ', '.'], [['Chinese']], '这里要填 Chinese；from China 是来源表达。'),
          write(P.american, '完整写出“我是美国人”，可用缩写。', 'I am American、I’m American 或 I am an American 都正确。American 作可数名词时用 an。', ["I'm American.", 'I am an American.', "I'm an American."]),
        ], [
          choice('要说“我来自日本”，哪句正确？', ['I am from Japanese.', 'I am from Japan.', 'I am Japan.'], 'I am from Japan.', 'from 后接国家 Japan；Japanese 用于国籍表达。'),
          write(P.japanese, '写出“我是日本人”，可用缩写。', 'I am Japanese 与 I’m Japanese 都正确。', ["I'm Japanese."]),
        ]),
      lesson('A1-02-05', '确认与纠正国籍', '把问句和否定用在新的个人信息中。',
        '确认国籍用 Are you Chinese?。对方猜错时，可以先说 No，再给出正确国籍。回答要跟情境一致，不是只判断句子有没有语法错误。',
        [P.areChinese, P.areJapanese, P.noJapanese, P.noChinese], [
          choice('你是日本人。对方问 Are you Chinese?，哪句符合情况？', ['Yes, I am.', "No, I'm Japanese.", "No, I'm Chinese."], "No, I'm Japanese.", '对方猜的是中国人，应否定并说明是日本人。'),
          listen(P.areJapanese, '听录音：这是在问什么？', ['姓名', '是否是日本人', '是否来自美国'], '是否是日本人', 'Japanese 是国籍词；Are you ...? 在确认信息。'),
          fill(P.areChinese, '补全“你是中国人吗？”。', ['', ' you ', '?'], [['Are'], ['Chinese']], 'Are you Chinese? 中不需要 from。'),
          write(P.noChinese, '你是中国人，纠正对方：“不是，我是中国人。”', 'No 后给出正确国籍；可以使用完整 I am。', ['No, I am Chinese.']),
          speak(P.areChinese, '先确认对方是否是中国人，再按自己的实际情况回答这个问题。', ['问句用 Are you Chinese?。', '回答的 Yes / No 与自己的情况一致。'], '自查内容与语法；示例不是对你的国籍作假设。'),
        ], [
          order(P.areJapanese, '组成“你是日本人吗？”。', ['Japanese?', 'you', 'Are'], 'Are 放在 you 前，Japanese 放在后。'),
          listen(P.noJapanese, '听完整回答：说话人说明自己是什么国籍？', ['中国人', '日本人', '美国人'], '日本人', 'No 是否定对方的猜测；后半句 I’m Japanese 才是实际信息。'),
        ]),
      lesson('A1-02-06', '姓名与来源对话', '听懂并组成包含两条信息的介绍。',
        '把姓名与来源连成两句，不必用还没学过的复杂连接词。听力要区分“谁说话”和“来自哪里”；开放任务可以替换自己的真实信息。',
        [P.originBen, P.originMia, P.whereFrom], [
          listen(P.originMia, '听录音，选出对应的信息。', ['Mia，来自日本', 'Mia，来自中国', 'Ben，来自日本'], 'Mia，来自日本', 'My name is Mia 给出姓名；I’m from Japan 给出来源。'),
          fill(P.china, '假设你来自中国，补全回答。', ['I ', ' ', ' China.'], [['am'], ['from']], '来源结构是 I am from + 地点。'),
          order(P.whereFrom, '介绍自己后，询问对方来自哪里。', ['are', 'from?', 'Where', 'you'], '完整问句是 Where are you from?。'),
          write(P.chinese, '补充国籍：“我是中国人。”可使用缩写。', '国籍词 Chinese 直接接在 am 后。', ["I'm Chinese."]),
          speak(P.originBen, '做一次自己的姓名与来源介绍，再问对方来自哪里。', ['包含姓名和来源，两条信息都清楚。', '来源使用 from + 地点。', '说出了 Where are you from?。'], '示例用 Ben 和 China；你可以用自己的信息，不使用固定答案自动评分。'),
        ], [
          listen(P.originBen, '换一段介绍：说话人的姓名与来源是？', ['Ben，来自中国', 'Ben，来自日本', 'Mia，来自中国'], 'Ben，来自中国', '录音包含 I’m Ben 和 I’m from China。'),
          write(P.notJapan, '纠正地点信息：写出“我不是来自日本”。', 'not 放在 am 后；完整形式和缩写都接受。', ["I'm not from Japan."]),
        ]),
    ],
  },
  {
    id: 'A1-03', title: '介绍身边的人', goal: '用简单句介绍一个人的姓名、身份与状态。',
    description: '学习 he、she、we、they，区分 am、is、are 的搭配。',
    lessons: [
      lesson('A1-03-01', '他和她', '用 he / she 介绍他人的姓名与来源。',
        'I 表示“我”；介绍另一个人时，he 表示“他”，she 表示“她”。he 和 she 后使用 is。以下情境会明确使用的代词，不靠姓名或职业猜测性别。',
        [P.heBen, P.sheMia, P.heChina, P.sheJapan], [
          choice('情境要求用“她”介绍 Mia，哪句正确？', ['He is Mia.', 'She is Mia.', 'I am Mia.'], 'She is Mia.', 'she 表示她；I am Mia 是介绍自己。'),
          listen(P.heChina, '听录音，哪项信息一致？', ['他来自中国', '她来自中国', '他来自日本'], '他来自中国', 'He 是他，China 是中国。'),
          order(P.sheMia, '组成“她是 Mia”。', ['Mia.', 'She', 'is'], 'She 与 is 连用。'),
          fill(P.heBen, '补全“他是 Ben”。', ['He ', ' Ben.'], [['is']], 'He 后用 is，不用 I 搭配的 am。'),
          write(P.sheJapan, '完整写出“她来自日本”，可用 She’s 缩写。', 'She is from Japan；She’s 是 She is 的缩写。', ["She's from Japan."]),
        ], [
          fill(P.sheMia, '这次用“她”，补全介绍。', ['', ' is Mia.'], [['She']], '她用 she；句首大写。'),
          write(P.heChina, '写出“他来自中国”，可用 He’s 缩写。', 'He is 或 He’s 后接 from China。', ["He's from China."]),
        ]),
      lesson('A1-03-02', '学生与老师', '说出一个人的学习或工作身份。',
        'student 是学生，teacher 是老师。介绍一名学生或老师时，本课使用 a student、a teacher。I am、he is、she is 都可接这两个身份表达。',
        [P.student, P.teacher, P.heTeacher, P.sheStudent], [
          listen(P.sheStudent, '听录音，哪项与录音一致？', ['她是学生', '她是老师', '他是学生'], '她是学生', 'She is a student：she 是她，student 是学生。'),
          choice('要表达“我是一名老师”，哪句正确？', ['I am a student.', 'I am a teacher.', 'He is a teacher.'], 'I am a teacher.', 'I 指自己，teacher 是老师。'),
          order(P.heTeacher, '组成“他是一名老师”。', ['teacher.', 'He', 'a', 'is'], 'He is 后接 a teacher；这里不能省略 a。'),
          fill(P.student, '补全“我是一名学生”。', ['I ', ' a ', '.'], [['am'], ['student']], 'I 后用 am；student 是学生。'),
          write(P.sheStudent, '写出“她是一名学生”，可用缩写。', 'She is a student；a 放在 student 前。', ["She's a student."]),
        ], [
          write(P.teacher, '换成介绍自己：“我是一名老师。”可用缩写。', 'I am a teacher 或 I’m a teacher。', ["I'm a teacher."]),
          listen(P.heTeacher, '听介绍，选出此人的身份。', ['学生', '老师', '没有说明身份'], '老师', 'teacher 是老师；本句在介绍他人的身份。'),
        ]),
      lesson('A1-03-03', '我们和他们', '介绍不止一个人的身份。',
        'we 是“我们”，they 可以是“他们／她们”。两者都与 are 连用。students、teachers 表示不止一人；复数前不加 a。这里先练这两种规则复数。',
        [P.weStudents, P.theyTeachers, P.theyStudents, P.weTeachers], [
          choice('你把自己也包括在一组学生中，应该说哪句？', ['We are students.', 'They are students.', 'She is a student.'], 'We are students.', 'We 包括说话人自己；They 指另一组人。'),
          listen(P.theyTeachers, '听录音，介绍的是哪一组人？', ['我们这些学生', '他们这些老师', '她这一名学生'], '他们这些老师', 'They 表示他们，teachers 表示多位老师。'),
          order(P.weStudents, '组成“我们是学生”。', ['students.', 'are', 'We'], 'We 后接 are；复数 students 前不用 a。'),
          fill(P.theyStudents, '补全“他们是学生”。', ['They ', ' student', '.'], [['are'], ['s']], 'They 搭配 are；student 加 s 表示多人。'),
          write(P.weTeachers, '写出“我们是老师”，可用 We’re 缩写。', 'We are teachers，或 We’re teachers；不在复数前加 a。', ["We're teachers."]),
        ], [
          fill(P.theyTeachers, '换成老师：补全“他们是老师”。', ['They ', ' teachers.'], [['are']], 'They 后使用 are。'),
          write(P.theyStudents, '完整写出“他们是学生”，可用 They’re 缩写。', 'They are students 或 They’re students。', ["They're students."]),
        ]),
      lesson('A1-03-04', '高兴还是累了', '用形容词描述人的状态。',
        'happy 表示高兴，tired 表示累。它们描述状态，不是身份名词，前面不用 a。主语仍决定使用 am、is 还是 are。',
        [P.happy, P.tired, P.sheHappy, P.heTired, P.theyHappy], [
          listen(P.heTired, '听录音，谁处于什么状态？', ['他累了', '她很高兴', '他们很高兴'], '他累了', 'He 是他，tired 表示累。'),
          choice('哪句表达“她很高兴”？', ['She is a happy.', 'She is happy.', 'She are happy.'], 'She is happy.', 'She 后用 is，happy 前不加 a。'),
          order(P.theyHappy, '组成“他们很高兴”。', ['happy.', 'They', 'are'], 'They 搭配 are，happy 描述状态。'),
          fill(P.happy, '补全“我很高兴”。', ['I ', ' ', '.'], [['am'], ['happy']], 'I 与 am 连用；happy 是高兴。'),
          speak(P.tired, '根据自己现在的情况，用 happy 或 tired 说一句状态；也可以练两个假设情境。', ['使用 I am 或 I’m。', 'happy / tired 前没有加 a。'], '这是描述状态的自查任务，不要求你真的处于示例状态。'),
        ], [
          write(P.sheHappy, '完整写出“她很高兴”，可用缩写。', 'She is happy 或 She’s happy；happy 前没有 a。', ["She's happy."]),
          fill(P.heTired, '换个人物和状态，补全“他累了”。', ['He ', ' ', '.'], [['is'], ['tired']], 'He 与 is 连用，tired 表示累。'),
        ]),
      lesson('A1-03-05', '询问一个人的身份', '用 Who ...? 和 Is ...? 问清人物信息。',
        'Who is he? 问“他是谁”；Is he a teacher? 确认他是不是老师。肯定回答 Yes, he is.。否定句中的 isn’t 是 is not 的缩写。',
        [P.whoHe, P.whoShe, P.isHeTeacher, P.isSheStudent, P.yesHe, P.noShe], [
          choice('你不知道“他是谁”，哪句直接询问身份？', ['Who is he?', 'Where are you from?', 'He is a teacher.'], 'Who is he?', 'Who 询问人；Where 询问地点。'),
          listen(P.isSheStudent, '听录音，问句在确认什么？', ['她是不是学生', '他是不是老师', '她来自哪里'], '她是不是学生', 'Is she a student? 确认她是不是学生。'),
          order(P.isHeTeacher, '组成“他是老师吗？”。', ['a', 'teacher?', 'he', 'Is'], '疑问句把 Is 放在 he 前；a teacher 保持在一起。'),
          fill(P.yesHe, '他确实是老师，补全简短肯定回答。', ['Yes, ', ' ', '.'], [['he'], ['is']], '问题问 he，回答也使用 he；简短肯定回答保留 is。'),
          write(P.noShe, '她不是学生，用简短否定回答：“不，她不是。”', 'No, she isn’t、No, she’s not 和 No, she is not 都可以。', ['No, she is not.', "No, she's not."]),
        ], [
          write(P.whoShe, '换个代词，写出“她是谁？”。', 'Who is she? 中 is 在 she 前。'),
          fill(P.isSheStudent, '补全“她是学生吗？”。', ['', ' she a ', '?'], [['Is'], ['student']], '单数主语 she 的问句以 Is 开头。'),
        ]),
      lesson('A1-03-06', '介绍一位熟人', '把姓名、来源、身份连成清楚的介绍。',
        '现在可以连续介绍姓名、来源、身份，再补充状态。每句都要有合适的主语和 am / is / are。听力里名字和身份同时出现，要分开记住。',
        [P.benIntro, P.miaIntro, P.theyHappy], [
          listen(P.miaIntro, '听完整介绍，哪组信息一致？', ['Mia，日本，学生', 'Mia，中国，老师', 'Ben，日本，学生'], 'Mia，日本，学生', '录音分别介绍姓名 Mia、来源 Japan、身份 student。'),
          choice('介绍两位老师，哪句使用了正确的主语和复数？', ['They is teachers.', 'They are a teacher.', 'They are teachers.'], 'They are teachers.', 'They 搭配 are；多位老师用 teachers，前面不加 a。'),
          fill(P.heTeacher, '情境：Ben 是老师。用“他”补全介绍。', ['', ' ', ' a teacher.'], [['He'], ['is']], 'He is a teacher；主语和 be 要搭配。'),
          write(P.sheHappy, '补充一句：“她很高兴。”可用缩写。', 'She is happy；描述状态不用 a。', ["She's happy."]),
          speak(P.benIntro, '选择一个真实或虚构的人，介绍姓名、来源和身份。可使用 Ben / Mia 的已学信息。', ['使用与情境一致的 he 或 she。', '至少说出了两条不同信息。', '单人介绍中使用 is。'], '真实姓名与地点不使用固定答案评分；不知道的职业可以先用本课学生或老师作假设练习。'),
        ], [
          listen(P.benIntro, '换一个人：录音中的 Ben 是什么身份，来自哪里？', ['老师，来自中国', '学生，来自中国', '老师，来自日本'], '老师，来自中国', 'He is from China；He is a teacher。'),
          order(P.weStudents, '最后介绍包括自己的这一组人：“我们是学生。”', ['are', 'students.', 'We'], 'We 表示我们，使用 are students。'),
        ]),
    ],
  },
  {
    id: 'A1-04', title: '认识日常物品', goal: '指认、询问并区分近处和远处的一件或多件物品。',
    description: '用真实日常物品练习 a / an、单复数以及 this / that / these / those。',
    lessons: [
      lesson('A1-04-01', '这件东西是什么', '问物品名称，并用 It is ... 回答。',
        'it 可以指刚提到的一件物品。What is it? 问“它是什么”。本课学习 book（书）、pen（笔）、bag（包），每件物品前用 a。It is 可以缩成 It’s。',
        [P.whatIt, P.book, P.pen, P.bag], [
          choice('眼前有一支笔，哪句准确说出物品名称？', ['It is a book.', 'It is a pen.', 'It is a bag.'], 'It is a pen.', 'pen 是笔，book 是书，bag 是包。'),
          listen(P.bag, '听录音，介绍的是什么物品？', ['书', '笔', '包'], '包', 'a bag 是一个包。'),
          order(P.book, '组成“它是一本书”。', ['book.', 'It', 'a', 'is'], 'It is 后接 a book。'),
          fill(P.pen, '补全“它是一支笔”。', ['It ', ' a ', '.'], [['is'], ['pen']], '一件物品用 It is；pen 是笔。'),
          write(P.whatIt, '写出询问物品的“它是什么？”。', 'What is it? 也可缩写成 What’s it?。', ["What's it?"]),
        ], [
          write(P.bag, '写出“它是一个包”，可用 It’s 缩写。', 'It is a bag 或 It’s a bag；a 不省略。', ["It's a bag."]),
          listen(P.book, '再听一次指认，选择物品。', ['包', '书', '笔'], '书', 'book 是书。'),
        ]),
      lesson('A1-04-02', '一个：a 还是 an', '根据后一个词的开头发音选择 a / an。',
        'a 和 an 都可表示一件东西。看后面词的开头发音：book、pen 用 a；apple（苹果）、egg（鸡蛋）以元音音素开头，用 an。不是任何以元音字母开头的词都机械用 an，要听发音。',
        [P.apple, P.egg, P.book, P.pen], [
          choice('选择表示“一个苹果”的正确搭配。', ['a apple', 'an apple', 'an book'], 'an apple', 'apple 以元音音素开头，使用 an。'),
          listen(P.egg, '听录音，物品是什么？', ['苹果', '鸡蛋', '书'], '鸡蛋', 'egg 是鸡蛋，完整表达为 an egg。'),
          order(P.apple, '组成“它是一个苹果”。', ['apple.', 'It', 'an', 'is'], 'It is 后接 an apple。'),
          fill(P.egg, '补全“它是一个鸡蛋”，只填冠词。', ['It is ', ' egg.'], [['an']], 'egg 开头是元音音素，前面使用 an。'),
          write(P.apple, '完整写出“它是一个苹果”，可用缩写。', 'It is an apple 或 It’s an apple。', ["It's an apple."]),
        ], [
          fill(P.book, '换回书：补出正确的冠词。', ['It is ', ' book.'], [['a']], 'book 开头是辅音音素，使用 a。'),
          write(P.egg, '写出“它是一个鸡蛋”，可用缩写。', 'an egg 中保留 an，不能换成 a。', ["It's an egg."]),
        ]),
      lesson('A1-04-03', '近处与远处的一件东西', '区分 this 和 that。',
        'this 指近处的一件物品，that 指较远处的一件物品，两者都与 is 连用。练习会明确告诉你物品远近，不需要猜图片里的距离。',
        [P.thisBook, P.thatBag, P.thisPen, P.thatBook], [
          choice('书就在你手边，要说“这是一本书”，选哪句？', ['This is a book.', 'That is a book.', 'It is an apple.'], 'This is a book.', '近处一件东西使用 this；that 指较远处。'),
          listen(P.thatBag, '听录音，哪个描述一致？', ['近处的一本书', '远处的一个包', '近处的一支笔'], '远处的一个包', 'That 指远处，a bag 是一个包。'),
          order(P.thisPen, '组成“这是一支笔”。', ['a', 'pen.', 'This', 'is'], '近处单件用 This is，接 a pen。'),
          fill(P.thatBook, '书在较远处，补全“那是一本书”。', ['', ' is a book.'], [['That']], '较远处的单件物品使用 That。'),
          speak(P.thisBook, '指着近处的一件已学物品，再指远处的一件，分别说一句。', ['近处使用 this，远处使用 that。', '两句都用 is。', '单件可数物品前保留 a 或 an。'], '物品可以换成 book、pen、bag、apple 或 egg；先根据真实位置判断远近。'),
        ], [
          write(P.thatBag, '写出“那是一个包”。可把 That is 缩成 That’s。', '远处使用 That is a bag。', ["That's a bag."]),
          fill(P.thisPen, '笔在手边，补全“这是一支笔”。', ['', ' ', ' a pen.'], [['This'], ['is']], '近处单件是 This is。'),
        ]),
      lesson('A1-04-04', '不止一件', '把单数物品改为规则复数。',
        'book、pen、apple 的复数在词尾加 s。多件物品使用 They are，不再使用 It is，复数前也不加 a / an。注意本课只练规则复数，其他变化会在后续出现。',
        [P.books, P.pens, P.apples], [
          choice('面前有不止一本书，哪句正确？', ['They are a book.', 'They are books.', 'They is books.'], 'They are books.', '多本书用 books；they 搭配 are；复数前不加 a。'),
          listen(P.apples, '听录音，哪项与录音一致？', ['一个苹果', '不止一个苹果', '不止一本书'], '不止一个苹果', 'They are apples 中的 they、are、apples 都对应复数。'),
          order(P.pens, '组成“它们是笔”。', ['pens.', 'They', 'are'], 'They 可以指它们；多支笔用 pens。'),
          fill(P.books, '补全“它们是书”。第二空只填复数词尾。', ['They ', ' book', '.'], [['are'], ['s']], 'They 与 are 连用，book 的规则复数是 books。'),
          write(P.apples, '完整写出“它们是苹果”，可用 They’re 缩写。', 'They are apples 或 They’re apples；不要加 an。', ["They're apples."]),
        ], [
          fill(P.pens, '换成笔，补全“它们是笔”。', ['They are pen', '.'], [['s']], 'pen 加 s 变成复数 pens。'),
          write(P.books, '写出“它们是书”，可用缩写。', 'They are books 或 They’re books。', ["They're books."]),
        ]),
      lesson('A1-04-05', '这些与那些', '用 these / those 指认多件物品。',
        'this 的复数是 these，表示近处的“这些”；that 的复数是 those，表示较远处的“那些”。these / those 后都使用 are，并把物品名称改为复数。',
        [P.theseBooks, P.thosePens, P.theseApples, P.thoseBooks], [
          choice('几本书就在你手边，“这些是书”应选哪句？', ['Those are books.', 'These are books.', 'This is a book.'], 'These are books.', '近处、多件，使用 These are books。'),
          listen(P.thosePens, '听录音，哪项描述一致？', ['近处的一支笔', '近处的多支笔', '远处的多支笔'], '远处的多支笔', 'Those 是远处的那些；pens 是复数。'),
          order(P.theseApples, '组成“这些是苹果”。', ['apples.', 'These', 'are'], 'These 与 are 连用；多个苹果用 apples。'),
          fill(P.thoseBooks, '书在远处且不止一本，补全“那些是书”。', ['', ' ', ' books.'], [['Those'], ['are']], '远处复数用 Those are；单数才用 That is。'),
          write(P.theseBooks, '完整写出“这些是书”。', 'These are books；these 的复数结构要与 are、books 一致。'),
        ], [
          fill(P.thosePens, '换成远处的多支笔，补全句子。', ['Those ', ' pen', '.'], [['are'], ['s']], 'Those 搭配 are；多支笔是 pens。'),
          write(P.theseApples, '写出“这些是苹果”。', 'These are apples；复数前不用 an。'),
        ]),
      lesson('A1-04-06', '把前四个单元一起用起来', '综合姓名、来源、人物身份和物品，完成初次见面的交流。',
        '先回顾自我介绍、来源和人物身份，再加入物品交流。What is this? 询问近处物品；Is that a bag? 确认远处物品。肯定可答 Yes, it is.，否定可答 No, it isn’t.。说话时注意 I am、he / she is、these / those are。',
        [P.originBen, P.benIntro, P.whatThis, P.isThatBag, P.yesIt, P.noIt, P.objects], [
          listen(P.originBen, '听这段初次见面的介绍：谁来自哪里？', ['Ben 来自中国', 'Mia 来自日本', 'Ben 来自日本'], 'Ben 来自中国', '先听到 I’m Ben，再听到 I’m from China；把姓名与来源联系起来。'),
          choice('Ben 是一名男老师。怎样向新朋友介绍他的职业？', ['He is a teacher.', 'She is a student.', 'They are books.'], 'He is a teacher.', '这里已明确 Ben 是男性，使用 He；职业表达保留 a teacher。'),
          fill(P.theseBooks, '近处有多本书，补全“这些是书”。', ['', ' ', ' book', '.'], [['These'], ['are'], ['s']], '近处复数需要 These、are 和 books 三处对应。'),
          write(P.whatThis, '完整写出询问近处物品的“这是什么？”。', 'What is this? 或 What’s this?。', ["What's this?"]),
          speak(P.objects, '想象第一次见面：先问候并介绍姓名和来源，再介绍一件近处物品和一组远处物品。', ['用 Hello 或 Hi 问候，并用 I’m / My name is 介绍姓名。', '用 I am from 介绍来源，国家名称可用已学的例子。', '近处单件用 This is，远处多件用 Those are，注意冠词和复数。'], '先用本课自我介绍与物品示例组合，再替换姓名和物品。这里记录你的自查，不自动评定口语等级。'),
        ], [
          order(P.notJapan, '换一个场景：组成“我不是来自日本”。', ['not', 'Japan.', 'I', 'from', 'am'], '否定来自哪里，在 am 后加 not，再接 from 和国家名称。'),
          write(P.heTeacher, '写出“他是一名老师”，可用 He’s 缩写。', 'He is a teacher 或 He’s a teacher；身份前的 a 不能漏。', ["He's a teacher."]),
        ]),
    ],
  },
]

export const dailyLessons: DailyLesson[] = dailyUnits.flatMap(unit => unit.lessons)
// Explicit reference lines for recognition; free expression keeps its original prompt and checks.
// Reuse existing recordings, including phrases taught in earlier lessons.
const speakingReferences: Record<string, string[]> = {
  'A1-01-01': ['hello', 'goodbye'],
  'A1-01-03': ['whats-your-name', 'my-name-is-ben'],
  'A1-01-04': ['no-im-ben'],
  'A1-01-05': ['im-mia'],
  'A1-01-06': ['meet-ben'],
  'A1-02-01': ['from-china'],
  'A1-02-05': ['are-you-chinese', 'yes-i-am'],
  'A1-02-06': ['origin-ben', 'where-are-you-from'],
  'A1-03-04': ['i-am-tired'],
  'A1-03-06': ['ben-introduction'],
  'A1-04-03': ['this-is-a-book', 'that-is-a-bag'],
  'A1-04-06': ['origin-ben', 'this-is-a-book', 'those-are-pens'],
}
for (const lesson of dailyLessons) for (const exercise of lesson.exercises) {
  if (exercise.kind === 'speak') exercise.readAloud = speakingReferences[lesson.id].map(id => {
    if (!phraseBank[id]) throw new Error(`Missing speaking reference: ${id}`)
    return phraseBank[id]
  })
}
export const dailyPhrases: DailyPhrase[] = [...new Map(dailyLessons.flatMap(lesson => lesson.phrases).map(phrase => [phrase.id, phrase])).values()]
const lessonsById = new Map(dailyLessons.map(lesson => [lesson.id, lesson]))
const exercisesById = new Map(dailyLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks]).map(exercise => [exercise.id, exercise]))
export const findDailyLesson = (id: string): DailyLesson | undefined => lessonsById.get(id)
export const findDailyExercise = (id: string): DailyExercise | undefined => exercisesById.get(id)
