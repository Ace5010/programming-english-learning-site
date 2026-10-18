import { programmingUnits, type ProgrammingExercise } from './programmingCourse.ts';
import { vocabulary } from './vocabulary.ts';

const courseIds = new Set(programmingUnits.flatMap(unit => unit.lessons.flatMap(lesson => lesson.wordIds)));
const coreWords = vocabulary.filter(word => courseIds.has(word.id));
const inflections: Record<string, string> = {
  branches: 'branch', changes: 'change', commits: 'commit', committed: 'commit', pushed: 'push',
  returns: 'return', integers: 'integer', objects: 'object', dependencies: 'dependency',
  installed: 'install', compiles: 'compile', runs: 'run', tests: 'test', failed: 'fail', fails: 'fail',
  passed: 'pass', fixed: 'fix', fixes: 'fix',
};

// These glosses explain existing question text; they are not new learning targets or answers.
export const programmingSupportMeanings: Record<string, string> = {
  a: '一个（用于单数名词前）', an: '一个（用于元音开头的单数名词前）', the: '这个／该（指特定事物）',
  this: '这个', there: '那里', here: '这里', i: '我', you: '你', your: '你的', my: '我的', our: '我们的',
  it: '它', all: '所有', each: '每个', one: '一／一个', two: '二／两个', three: '三／三个',
  five: '五', ten: '十', first: '先／第一', following: '接下来的', then: '然后',
  before: '在……之前', when: '当……时', now: '现在', again: '再次', once: '一次／曾经',
  always: '总是', still: '仍然', yet: '还／尚（常用于否定句）', only: '只／仅',
  and: '并且', or: '或者', because: '因为', if: '如果', as: '作为／如同',
  to: '到／向（也用于动词前）', from: '从／来自', for: '为了／用于', of: '……的',
  in: '在……里面', on: '在……上', at: '在（某处或某时）', with: '带有／与……一起',
  up: '向上', down: '向下', not: '不／没有',
  is: '是', are: '是（用于复数或 you）', be: '是／成为', has: '有',
  do: '做（也用于疑问或否定）', did: '做过（do 的过去式）', can: '可以／能够',
  cannot: '不能', may: '可能／可以', should: '应该',
  read: '阅读', open: '打开', opening: '正在打开', write: '写', work: '工作',
  create: '创建', creates: '创建', make: '做出／制作', use: '使用', put: '放入／放置',
  add: '相加／添加', adds: '相加／添加', set: '设置', save: '保存', saved: '已保存的', saves: '保存',
  send: '发送', copy: '复制／副本', keep: '保持／保留', stays: '保持／停留',
  find: '查找', found: '已找到的', ask: '询问／请求', check: '检查', review: '检查／复查',
  switch: '切换', call: '调用', takes: '接受／需要', gets: '获取',
  shows: '显示', contains: '包含', describes: '描述', proposes: '提出', needs: '需要',
  denied: '已拒绝的', please: '请', help: '帮助',
  new: '新的', latest: '最新的', original: '原来的', local: '本地的', clear: '清楚的',
  ready: '准备好的', complete: '完成／完整的', missing: '缺少的', free: '免费的／自由的',
  true: '真／成立', false: '假／不成立',
  name: '名称／名字', names: '名称（复数）', numbers: '数（复数）', value: '值',
  data: '数据', text: '文字／文本', count: '计数／数量', times: '次数／倍',
  age: '年龄', user: '用户', users: '用户（复数）', page: '页面', computer: '电脑',
  app: '应用', development: '开发', feature: '功能（此处也用作分支名）', config: '配置（此处也用作变量名）',
  git: '版本管理工具 Git', github: '代码托管网站 GitHub', react: '界面开发库 React',
  js: 'JavaScript 的缩写／文件扩展名', json: '一种数据格式／文件扩展名', src: '源码目录名',
  greet: '示例函数名，意为“打招呼”', ben: '人名 Ben', kai: '人名 Kai', max: '最大值（此处也用作变量名）',
};

/** Check every visible English option and sentence, not just the scored word ID. */
export function programmingExerciseSupport(exercise: ProgrammingExercise) {
  const filled = exercise.parts?.map((part, index) => part + (exercise.blanks?.[index]?.[0] ?? '')).join('');
  const audioWord = exercise.audioId && vocabulary.find(word => `example-${word.id}` === exercise.audioId || `word-${word.id}` === exercise.audioId);
  let text = [exercise.prompt, ...(exercise.options ?? []), filled ?? '',
    audioWord ? exercise.audioId!.startsWith('example-') ? audioWord.example : audioWord.word : '',
  ].join('\n');
  const referenced = new Set<string>(exercise.prerequisiteIds ?? []);
  // Multiword targets consume their full span before shorter words are considered.
  const forms = coreWords.flatMap(word => [word.word, ...Object.keys(inflections).filter(form => inflections[form] === word.word)]
    .map(form => ({ form, id: `word-${word.id}` }))).sort((a, b) => b.form.length - a.form.length);
  for (const { form, id } of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), match => { referenced.add(id); return ' '.repeat(match.length); });
  }
  const tokens = new Map<string, string>();
  for (const token of text.match(/[A-Za-z]+/g) ?? []) tokens.set(token.toLowerCase(), tokens.get(token.toLowerCase()) ?? token);
  const supportWords = [...tokens].flatMap(([word, en]) => programmingSupportMeanings[word] ? [{ en, zh: programmingSupportMeanings[word] }] : []);
  return { prerequisiteIds: [...referenced].filter(id => !exercise.knowledgeIds.includes(id)), supportWords };
}
