import type { DailyExercise, DailyLesson, DailyPhrase, DailyUnit } from './dailyCourse.ts'
import { vocabulary } from './vocabulary.ts'

/** Course progress is separate; these IDs always refer to the existing vocabulary. */
export type ProgrammingAbility = 'meaning' | 'listening' | 'spelling' | 'context'
export type ProgrammingExercise = DailyExercise & { wordIds: number[]; ability: ProgrammingAbility; knowledgeIds: string[] }
export type ProgrammingLesson = Omit<DailyLesson, 'exercises' | 'rechecks'> & {
  wordIds: number[]
  exercises: ProgrammingExercise[]
  rechecks: ProgrammingExercise[]
}
export type ProgrammingUnit = Omit<DailyUnit, 'lessons'> & { lessons: ProgrammingLesson[] }
type Draft = Omit<ProgrammingExercise, 'id'>

const words = new Map(vocabulary.map(item => [item.word, item]))
const getWord = (name: string) => {
  const item = words.get(name)
  if (!item) throw new Error(`Programming course word is missing: ${name}`)
  return item
}
const ids = (names: string[]) => [...new Set(names.map(name => getWord(name).id))]
const metadata = (names: string[], ability: ProgrammingAbility) => {
  const wordIds = ids(names)
  return { wordIds, ability, knowledgeIds: wordIds.map(id => `word-${id}`) }
}
const R = (names: string[], prompt: string, options: string[], answer: string, explanation: string): Draft =>
  ({ kind: 'choice', ...metadata(names, 'context'), prompt, options, answers: [answer], explanation })
const M = (name: string, prompt: string, options: string[], answer: string, explanation: string): Draft =>
  ({ kind: 'choice', ...metadata([name], 'meaning'), prompt, options, answers: [answer], explanation })
const L = (name: string, options: string[]): Draft =>
  ({ kind: 'listen', ...metadata([name], 'listening'), audioId: `word-${getWord(name).id}`, prompt: '听录音，选出听到的词。', options, answers: [name], explanation: `${name} 在本课表示“${getWord(name).meaning}”。` })
const F = (name: string, prompt: string, parts: string[], explanation: string): Draft =>
  ({ kind: 'fill', ...metadata([name], 'spelling'), prompt, parts, blanks: [[name]], explanation })
const W = (name: string, prompt: string, explanation: string): Draft =>
  ({ kind: 'write', ...metadata([name], 'spelling'), prompt, answers: [name], explanation })
const O = (names: string[], prompt: string, ordered: string[], explanation: string): Draft =>
  ({ kind: 'order', ...metadata(names, 'context'), prompt, options: ordered, answers: [ordered.join(' ')], explanation })

function stableOptions(options: string[], seed: string): string[] {
  // Keep the same tile positions after a refresh without teaching an answer position.
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  const result = [...options]
  for (let index = result.length - 1; index > 0; index--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    const next = (state >>> 0) % (index + 1)
    ;[result[index], result[next]] = [result[next], result[index]]
  }
  return result
}

function identify(task: Draft, id: string): ProgrammingExercise {
  return { ...task, id, ...(task.options ? { options: stableOptions(task.options, id) } : {}) }
}

function lesson(id: string, title: string, goal: string, explanation: string, taught: string[], exercises: Draft[], rechecks: Draft[]): ProgrammingLesson {
  const phrases: DailyPhrase[] = taught.flatMap(name => {
    const item = getWord(name)
    return [
      { id: `word-${item.id}`, en: item.word, zh: item.meaning },
      { id: `example-${item.id}`, en: item.example, zh: item.exampleZh },
    ]
  })
  // A repeated listening item may use a word taught in an earlier lesson.
  for (const task of [...exercises, ...rechecks]) if (task.audioId && !phrases.some(phrase => phrase.id === task.audioId)) {
    const item = vocabulary.find(word => `word-${word.id}` === task.audioId)!
    phrases.push({ id: task.audioId, en: item.word, zh: item.meaning })
  }
  return { id, title, goal, explanation, wordIds: ids(taught), phrases,
    exercises: exercises.map((task, index) => identify(task, `${id}-e${String(index + 1).padStart(2, '0')}`)),
    rechecks: rechecks.map((task, index) => identify(task, `${id}-r${String(index + 1).padStart(2, '0')}`)),
  }
}

export const programmingUnits: ProgrammingUnit[] = [
  {
    id: 'P1-01', title: '看懂 GitHub 项目', goal: '读懂项目首页和一次基本的代码协作流程。',
    description: '从仓库和项目说明开始，学会辨认复制、分支、提交和同步的方向。',
    lessons: [
      lesson('P1-01-01', '仓库里有什么', '分清仓库、项目、代码和项目说明。',
        'repository 是保存代码和修改历史的仓库，project 是正在做的项目，code 是代码。README 是项目说明文件。Read 表示“阅读”，open 表示“打开”，this 表示“这个”。例如 Read the README. 是“阅读项目说明”；Open this repository. 是“打开这个代码仓库”。先点读词和例句，接着根据项目首页判断信息。',
        ['repository', 'project', 'code', 'readme'], [
          M('repository', 'repository 对应哪一种内容？', ['代码仓库', '用户姓名', '网页颜色'], '代码仓库', 'repository 保存项目代码和相关修改历史。'),
          R(['readme'], '项目首页写着 Read the README.，应该先阅读什么？', ['项目说明文件', '个人头像', '浏览器地址'], '项目说明文件', 'Read 是阅读；README 是项目说明文件。'),
          L('code', ['code', 'project', 'repository']),
          R(['project', 'code'], 'This project has code.（has 表示“有”）这句话说明什么？', ['这个项目中有代码', '这个项目没有名字', '代码就是项目说明文件'], '这个项目中有代码', 'project 是项目，code 是代码；has 把两者的关系连起来。'),
          R(['repository'], 'This repository contains the code.（contains 表示“包含”）这里的 repository 指什么？', ['存放代码的仓库', '一行代码', '打开网页的按钮'], '存放代码的仓库', '换成 contains 后，repository 仍是存放代码的仓库。'),
        ], [
          M('readme', 'GitHub 上的 README 通常是什么？', ['项目说明文件', '代码提交者的姓名', '一个密码'], '项目说明文件', 'README 用于说明项目用途和使用方法。'),
          R(['project', 'code'], 'Open the project and read the code.（and 表示“并且”）需要做哪两件事？', ['打开项目并阅读代码', '删除项目并写姓名', '只阅读项目标题'], '打开项目并阅读代码', 'project 指项目，code 指代码；两个动作是 open 和 read。'),
        ]),
      lesson('P1-01-02', '复制到哪里', '区分 clone 到电脑和 fork 到自己的 GitHub 账号。',
        'clone 是把仓库克隆到电脑上的一个位置；fork 是在 GitHub 上派生出自己账号下的仓库。它们都与复制有关，但位置和后续用途不同。Clone this repository. 是“克隆这个仓库”；Fork this project on GitHub. 是“在 GitHub 上复刻这个项目”。to 表示“到”，your 表示“你的”。',
        ['clone', 'fork'], [
          M('clone', 'clone 在 Git 场景里表示什么？', ['克隆仓库', '改项目名称', '阅读说明'], '克隆仓库', 'clone 把仓库复制到本地，并保留 Git 历史。'),
          R(['clone', 'repository'], 'Clone this repository to your computer.（computer 是电脑）这一步把仓库放在哪里？', ['你的电脑上', '只放在项目首页标题里', '另一位用户的头像里'], '你的电脑上', 'clone ... to your computer 指把仓库克隆到你的电脑。'),
          R(['fork'], '你准备在自己的 GitHub 账号下保留一份派生仓库。页面上哪个词最符合？', ['Fork', 'README', 'Open'], 'Fork', 'fork 在托管平台上创建属于自己账号的派生仓库。'),
          F('clone', '补全“克隆这个仓库”的操作词。', ['', ' this repository.'], 'clone 是克隆；这里需要完整的操作词。'),
          R(['clone', 'fork'], 'Fork the project, then clone your fork.（then 表示“然后”）第二步针对的是什么？', ['自己派生出的仓库', '项目说明的字体', '别人的账号密码'], '自己派生出的仓库', '先 fork 得到自己的派生仓库，再 clone 这份仓库到本地。'),
        ], [
          M('fork', 'fork 在 GitHub 上主要指什么？', ['派生仓库', '终止电脑运行', '翻译说明文字'], '派生仓库', 'fork 是在自己账号下派生一份仓库。'),
          R(['clone', 'fork'], 'Clone the original repository.（original 表示“原来的”）这条说明是否要求先 fork？', ['没有要求，直接克隆原仓库', '要求先 fork 再删除原仓库', '要求只读 README'], '没有要求，直接克隆原仓库', 'clone 和 fork 是不同动作；这里只要求 clone 原仓库。'),
        ]),
      lesson('P1-01-03', '在分支中工作', '看懂新建分支与切换分支的区别。',
        'branch 是分支，可让一组修改单独进行。main 是常见的主分支名称，也有项目使用其他名称。Create a new branch. 表示“新建一个分支”；git checkout main 表示切换到名为 main 的分支。普通 checkout 不等于新建分支；这里先辨认这条命令的作用。new 是“新的”，create 是“创建”，switch 是“切换”。',
        ['branch', 'checkout', 'main'], [
          M('branch', 'branch 在这里是什么？', ['分支', '说明文件', '账号密码'], '分支', 'Git 分支让一组代码修改可以独立进行。'),
          R(['checkout', 'main'], '终端中出现 git checkout main，这条命令要做什么？', ['切换到 main 分支', '把 main 当作仓库地址下载', '删除所有分支'], '切换到 main 分支', 'checkout 在本句中执行切换；main 是目标分支名称。'),
          L('branch', ['branch', 'clone', 'code']),
          R(['branch'], 'Create a new branch. 中 new 修饰什么？', ['要创建的分支', '电脑上的用户', '项目的说明文字'], '要创建的分支', 'a new branch 是“一个新分支”。'),
          R(['main'], '当前在 feature 分支。说明写 Switch to main.，下一步应处于哪里？', ['main 分支', '仍在 feature 分支', 'README 文件中'], 'main 分支', 'switch to main 表示切换到 main；不表示删除当前分支。'),
        ], [
          M('checkout', '本课 git checkout main 中 checkout 表示什么？', ['切换分支', '购买项目', '创建账号'], '切换分支', 'checkout 在其他语境可能有别的意思，这里是 Git 的切换操作。'),
          R(['branch', 'main'], 'Work on a new branch, not main.（work on 是“在……上工作”，not 是“不要”）修改应放在哪里？', ['新分支上', 'main 分支上', 'README 标题里'], '新分支上', '这条说明明确选择 new branch，并排除 main。'),
        ]),
      lesson('P1-01-04', '保存一次修改', '把 change、commit 和 message 连成可理解的操作。',
        'change 既可作动词“修改”，也可作名词“修改内容”；changes 是多处修改。commit 是一次提交，把选中的修改记录到本地 Git 历史中。message 是说明文字；commit message 解释这次提交改了什么。Commit your changes. 是“提交你的修改”。Write a message. 是“写一条说明”。提交本身不等于把代码发到 GitHub。',
        ['change', 'commit', 'message'], [
          M('commit', 'commit 在 Git 中主要指什么？', ['提交并留下记录', '新建 GitHub 账号', '朗读代码'], '提交并留下记录', 'commit 为选中的修改建立一次本地提交记录。'),
          R(['change'], 'Review your changes.（review 表示“检查”）需要检查什么？', ['自己修改过的内容', '所有用户的密码', '网站使用的语言'], '自己修改过的内容', 'changes 是 change 的复数，这里是“修改内容”。'),
          R(['commit', 'message'], 'Write a commit message. 需要写什么？', ['说明这次提交改了什么的文字', '电脑开机密码', '仓库的所有代码'], '说明这次提交改了什么的文字', 'commit message 是提交说明，不是仓库的全部内容。'),
          F('commit', '补出操作词：把这次修改记录为一次提交。', ['', ' your changes.'], 'Commit your changes. 表示提交你的修改。'),
          R(['commit'], 'The commit is local.（local 表示“本地的”）仅凭这句话可以确定什么？', ['提交记录在本地', '修改已发送到所有远程仓库', '项目已发布上线'], '提交记录在本地', '本地 commit 不代表已经推送或发布。'),
        ], [
          M('message', 'commit message 中的 message 表示什么？', ['提交说明', '一个代码仓库', '分支的副本'], '提交说明', 'message 在此处是描述本次提交的文字。'),
          R(['change', 'commit'], 'Make a change, then commit it.（make 表示“做出”）哪个动作先发生？', ['修改内容', '提交还不存在的修改', '打开新的账号'], '修改内容', '先 make a change 做出修改，再 commit it 提交这次修改。'),
        ]),
      lesson('P1-01-05', '同步修改的方向', '分清 push、pull 和 origin 指向哪里。',
        'remote 是远程仓库；origin 是克隆仓库时通常使用的远程名称，也可以更改。push 把本地提交推送出去，pull 把远程更新取回并整合到当前分支。Push your changes to origin. 是“把修改推送到 origin”；Pull the latest changes. 是“拉取最新修改”。latest 表示“最新的”。重点看动作与方向。',
        ['push', 'pull', 'remote', 'origin'], [
          M('remote', 'remote 在 This remote has our code. 中指什么？', ['远程仓库', '本地的一个字母', '项目说明的标题'], '远程仓库', 'remote 在 Git 场景里可指远程仓库。'),
          R(['push', 'origin'], 'Push your changes to origin. 说明中的目的地是什么？', ['名为 origin 的远程仓库', '当前页面的正文', '一条新的提交说明'], '名为 origin 的远程仓库', 'push ... to origin 表示把本地提交推向 origin。'),
          R(['pull'], '同伴已更新远程仓库。说明写 Pull the latest changes.，动作方向是什么？', ['从远程取回更新', '只把自己的更新发送出去', '删除远程仓库'], '从远程取回更新', 'pull 将远程最新修改取回并整合。'),
          W('push', '只写出一个操作词：把本地提交推送到远程。', 'push 是向外推送，pull 是拉取回来。'),
          R(['push', 'pull'], '先取回同伴更新，稍后发送自己的提交。两次操作依次是什么？', ['pull，然后 push', 'push，然后 push', 'clone，然后 fork'], 'pull，然后 push', '方向分别是远程到本地、本地到远程。'),
        ], [
          M('origin', 'origin 在 Git 中通常是什么？', ['一个远程仓库名称', '固定的密码', '所有分支都必须使用的名称'], '一个远程仓库名称', 'origin 是常用远程名称，不是必须固定的分支名。'),
          F('pull', '补全操作词：拉取新的代码。', ['', ' the new code.'], 'Pull the new code. 表示拉取新代码。'),
        ]),
      lesson('P1-01-06', '读一段协作说明', '把仓库、分支、提交和同步放进同一段说明。',
        '这一课把前面学过的动作放进新材料。先找动作词，再看它作用于哪个对象：Read 对应 README，clone 对应仓库，checkout 对应分支，commit 对应修改，push 和 pull 要看方向。不要只凭熟悉的单词猜答案。following 表示“接下来的”，after 表示“在……之后”。题中的操作顺序以给出的说明为准。',
        ['repository', 'readme', 'branch', 'commit', 'push', 'pull'], [
          R(['readme', 'clone'], 'README 写着：Read this page. Then clone the repository. 按这段说明，克隆前要做什么？', ['先读这一页说明', '先推送代码', '先删除分支'], '先读这一页说明', 'then 连接先后顺序：先 read，再 clone。'),
          O(['branch', 'commit', 'push'], '按要求排列三个步骤：先创建分支，完成修改并提交，最后推送这些提交。', ['Create a branch.', 'Commit your changes.', 'Push your commits.'], '先有工作分支，再记录修改，最后把提交推送出去。这里每个词块是一条完整指令。'),
          R(['checkout', 'main', 'pull'], 'git checkout main\ngit pull origin main\n第二行从哪里获取更新？', ['origin 的 main 分支', '只从 README 获取', '从尚未创建的本地提交获取'], 'origin 的 main 分支', 'pull 从远程取回更新；这里明确写出了 origin 和 main。'),
          R(['commit', 'message'], 'Before you commit, write a clear message.（before 是“在……之前”，clear 是“清楚的”）说明文字用于什么？', ['解释本次提交的修改', '替换仓库里的全部代码', '证明代码已经上线'], '解释本次提交的修改', '这里的 message 是提交说明；它不等于代码，也不证明已经发布。'),
          R(['push', 'pull', 'remote'], 'Your remote has new changes. Pull first.（first 表示“先”）现在应该先做什么？', ['取回远程新修改', '再次克隆所有仓库', '直接把所有分支删掉'], '取回远程新修改', '题面说明远程有新修改，并明确要求 pull first。'),
        ], [
          R(['fork', 'clone'], 'Fork this project. Clone your fork. 哪一步会把仓库下载到电脑？', ['Clone your fork.', 'Fork this project.', '两步都只修改 README'], 'Clone your fork.', 'fork 在 GitHub 上派生仓库；clone 将它克隆到电脑。'),
          R(['change', 'commit', 'push'], 'Changes committed. Not pushed.（not 表示“没有”）现在是什么状态？', ['修改已有本地提交，还没有推送', '修改已推送并发布', '没有任何提交记录'], '修改已有本地提交，还没有推送', 'committed 表示已提交，not pushed 明确说明尚未推送。'),
        ]),
    ],
  },
  {
    id: 'P1-02', title: '看懂代码里的基础英语', goal: '读懂函数、数据和控制流程的简短说明。',
    description: '用小段代码和注释认识数据类型、参数、对象与循环。',
    lessons: [
      lesson('P1-02-01', '函数和存放数据的名字', '区分 function、variable 与 constant。',
        'function 是完成一段操作的函数；variable 是可存放并重新赋值的数据名称；constant 是常量。先看说明中的角色，不必先学完整编程语法。This function adds two numbers. 是“这个函数把两个数相加”。adds 是“相加”，numbers 是“数”。JavaScript 的 const 不允许重新给这个名字赋值，但不保证对象内部永远不变。',
        ['function', 'variable', 'constant'], [
          M('function', 'function 表示什么？', ['函数', '代码仓库', '远程分支'], '函数', '函数把一段操作组织在一起。'),
          R(['function'], 'This function adds two numbers. 这段说明的主要意思是什么？', ['函数把两个数相加', '函数删除两个名字', '函数只保存仓库地址'], '函数把两个数相加', 'adds two numbers 是把两个数相加。'),
          R(['variable'], '注释写着 The variable can change.（can 是“可以”）这里允许什么变化？', ['变量保存的值发生变化', '常量名称自动消失', '仓库自动被克隆'], '变量保存的值发生变化', 'variable 是变量；这里的 can change 说明它的值可以变化。'),
          F('function', '补出术语：这个函数把两个数相加。', ['This ', ' adds two numbers.'], 'function 是函数；这里需要完整单词。'),
          R(['constant'], 'This constant is always five.（always 是“始终”）这句说明给出的值是什么？', ['始终是五', '每次增加五', '由用户姓名决定'], '始终是五', 'always five 表示在这段说明中始终为五。'),
        ], [
          M('variable', 'variable 在代码说明中是什么？', ['变量', '说明文件', '项目标题'], '变量', '变量用名称保存数据，它所保存的值可以重新赋值。'),
          R(['constant'], 'Keep MAX fixed; change count.（keep fixed 是“保持固定”）哪个更适合描述固定值 MAX？', ['constant', 'repository', 'branch'], 'constant', '固定的 MAX 对应 constant；可以更新的 count 对应 variable。'),
        ]),
      lesson('P1-02-02', '传进去和返回来', '理解 parameter、argument 和 return 的不同位置。',
        'function greet(name) { return name; } 定义了函数：name 是 parameter（形参），相当于预留的位置。调用 greet("Mia") 时，"Mia" 是 argument（实参），是这次传进去的实际值。return 把结果返回给调用处。两种参数在中文里常都叫“参数”，要靠定义或调用的上下文区分。',
        ['parameter', 'argument', 'return'], [
          M('parameter', '函数定义中预留的参数位置叫什么？', ['parameter', 'repository', 'message'], 'parameter', 'parameter 是定义时的形参；argument 是调用时传入的实参。'),
          R(['parameter'], 'function greet(name) { return name; }\n只看这段定义，name 的角色是什么？', ['形参', '远程仓库', '提交说明'], '形参', 'name 位于函数定义的参数位置，是 parameter。'),
          R(['argument'], '调用 greet("Ben") 时，实际传入的 argument 是哪个？', ['"Ben"', 'greet 这个函数名', 'README'], '"Ben"', 'argument 是本次调用传入的值，这里是字符串 "Ben"。'),
          F('return', '补出代码词：把 name 返回给调用处。', ['', ' name;'], 'return name 表示返回 name 的值。'),
          R(['return'], 'This function returns a name.（returns 是 return 在此处的形式）说明在讲什么？', ['函数返回什么结果', '项目应该叫什么', '提交说明写给谁'], '函数返回什么结果', 'returns a name 描述函数的返回结果是一个名字。'),
        ], [
          M('argument', '函数调用时传入的实际值叫什么？', ['argument', 'branch', 'constant message'], 'argument', 'argument 是实参，不是定义里的占位名称。'),
          R(['parameter', 'argument'], '定义：function add(a, b)\n调用：add(2, 3)\n哪组是这次调用的实参？', ['2 和 3', 'a 和 b', 'add 和 function'], '2 和 3', 'a、b 是形参；2、3 是调用时传入的实参。'),
        ]),
      lesson('P1-02-03', '数据是什么类型', '从示例值读懂 string、integer、boolean 和 array。',
        'string 是字符串，例如 "Mia"；integer 是整数，例如 5；boolean 是布尔值，取 true（真）或 false（假）；array 是数组，例如 ["Mia", "Ben"]。引号里的 "5" 是字符串，不等同于数值 5。This function returns a string. 是“这个函数返回一个字符串”。先看值和符号，再看英文说明。',
        ['string', 'integer', 'boolean', 'array'], [
          M('array', 'array 表示什么？', ['数组', '提交说明', '远程仓库'], '数组', '数组可按顺序存放多个值，例如多个姓名。'),
          R(['string', 'integer'], '说明写着 The value is a string.（value 是“值”）哪个示例符合？', ['带引号的 "5"', '数值 5', '布尔值 false'], '带引号的 "5"', '引号中的 "5" 是字符串；数值 5 是整数。'),
          R(['boolean'], 'This function returns a boolean. 哪一种返回结果符合说明？', ['true 或 false', '只能是姓名字符串', '必须是三个数构成的数组'], 'true 或 false', 'boolean 的两个值是 true 和 false。'),
          F('string', '补出返回类型：这个函数返回一个字符串。', ['This function returns a ', '.'], 'string 表示字符串。'),
          R(['array', 'integer'], 'This array has three integers: [2, 4, 6]. 这组数据是什么？', ['包含三个整数的数组', '包含三个仓库的目录', '一个只有 true 的布尔值'], '包含三个整数的数组', 'array 是数组；integers 是 integer 的复数，2、4、6 都是整数。'),
        ], [
          M('integer', 'integer 表示哪一类数？', ['整数', '所有带引号的文字', '只有真和假'], '整数', '例如 0、5、-2 都是整数；不要求它一定为正数。'),
          R(['boolean', 'string'], '第一项 false；第二项 "false"。哪个是 boolean？', ['第一项', '第二项', '两项都是数组'], '第一项', '没有引号的 false 是布尔值；带引号的 "false" 是字符串。'),
        ]),
      lesson('P1-02-04', '对象里有什么', '区分类、对象与属性。',
        'class 可理解为定义一类对象的结构；object 是实际的对象；property 是对象上的一项属性。先看小例子：user = { name: "Mia" }。这里 user 是一个对象，name 是属性，"Mia" 是属性值。Make a class for users. 是“创建一个表示用户的类”；Change the name property. 是“修改 name 属性”。',
        ['class', 'object', 'property'], [
          M('object', 'object 在这类代码说明中表示什么？', ['对象', '上传方向', '项目说明'], '对象', '对象把相关的数据或行为组织在一起。'),
          R(['object', 'property'], 'user = { name: "Ben" }\n说明让你 Read the name property.，要读取什么？', ['name 对应的 "Ben"', '另一个远程仓库', '一条 Git 提交'], 'name 对应的 "Ben"', 'property 指对象上的属性，这里 name 的值是 "Ben"。'),
          L('class', ['class', 'clone', 'code']),
          R(['class'], 'Create a class for users.（users 是“用户”）这条说明让你创建什么？', ['用于表示用户的类', '用户的 GitHub 密码', '一个名为 users 的远程地址'], '用于表示用户的类', 'a class for users 是用于表示用户的一类结构。'),
          R(['property'], 'Change the name property, not the age property.（age 是“年龄”）应修改哪一项？', ['name', 'age', '所有属性'], 'name', 'not 排除了 age；指定的目标是 name property。'),
        ], [
          M('property', 'property 在对象语境里表示什么？', ['属性', '版本分支', '安装命令'], '属性', 'property 是对象上的一项数据或成员属性。'),
          R(['class', 'object'], 'This class creates user objects.（creates 是“创建”）objects 指什么？', ['由这个类创建的用户对象', 'README 中的几段文字', '远程仓库地址'], '由这个类创建的用户对象', 'class 是类，objects 是 object 的复数，指实际对象。'),
        ]),
      lesson('P1-02-05', '条件、循环与方法', '看懂何时执行、重复几次和调用哪个方法。',
        'condition 是决定是否执行的条件；loop 是重复执行的循环；method 是与对象或类相关的方法。if ready（ready 表示“准备好”）提示按条件执行；repeat three times 表示重复三次。This method saves the file. 是“这个方法保存文件”。这里先学会阅读这些说明，不要求凭记忆写完整代码。',
        ['condition', 'loop', 'method'], [
          M('loop', 'loop 表示什么？', ['循环', '仓库名称', '一条提交说明'], '循环', 'loop 让某段操作重复执行。'),
          R(['condition'], 'Run only if the condition is true.（only if 是“仅当”）什么时候才运行？', ['条件为真时', '不论条件真假都运行', '只要有 README 就运行'], '条件为真时', 'only if 限定条件；true 表示真。'),
          R(['loop'], 'This loop runs three times. 操作会执行几次？', ['三次', '一次', '永远不执行'], '三次', 'three times 表示三次，说明的是循环执行次数。'),
          W('method', '只写术语：与对象或类相关的“方法”。', 'method 是方法；不是 change，也不是 message。'),
          R(['method'], 'Call the save method.（call 是“调用”，save 是“保存”）要求调用什么？', ['名为 save 的方法', '名为 save 的仓库地址', '所有布尔值'], '名为 save 的方法', 'save 是方法名称，method 表明要调用的是方法。'),
        ], [
          M('condition', 'condition 在 if 说明里表示什么？', ['条件', '账号', '仓库副本'], '条件', '条件决定相应操作是否执行。'),
          R(['condition', 'loop', 'method'], 'If ready is true, run this method in a loop. 哪项理解符合？', ['准备好时，在循环中运行这个方法', '每次都创建一个远程仓库', '条件为假时才读取 README'], '准备好时，在循环中运行这个方法', 'if 引出条件，loop 表示重复，method 是被运行的方法。'),
        ]),
      lesson('P1-02-06', '读懂一段代码说明', '把参数、返回值、类型和执行条件连起来。',
        '本课把已经学过的术语放进新的简短说明。阅读顺序可以是：谁在执行，接收什么，返回什么，什么条件下执行。takes 在函数说明里常表示“接收”，each 表示“每一个”。不要仅凭代码里的引号或某个熟悉词判断整句；同时看 parameter、argument、return 和 condition 的关系。',
        ['function', 'parameter', 'return', 'array', 'condition', 'method'], [
          R(['function', 'integer', 'return'], 'This function takes two integers and returns a string. 它返回的是什么？', ['一个字符串', '两个整数', '一个远程分支'], '一个字符串', 'takes 讲输入，returns 讲输出；不能把 two integers 当作返回类型。'),
          R(['parameter', 'argument'], '定义：function greet(name)\n调用：greet("Kai")\nname 和 "Kai" 分别是什么？', ['形参和实参', '实参和形参', '两个仓库名称'], '形参和实参', '定义里的 name 是 parameter；调用里的 "Kai" 是 argument。'),
          R(['array', 'object', 'property'], 'The array has two objects. Each object has a name property. 这段说明描述什么？', ['数组中有两个对象，每个都有 name 属性', '数组只有两个字符串，没有对象', '两个类共用一个 Git 分支'], '数组中有两个对象，每个都有 name 属性', 'each 表示每一个；name property 属于对象。'),
          R(['condition', 'boolean', 'method'], 'Call the method only if ready is true. 当 ready 为 false 时，按这段说明应怎样？', ['不调用这个方法', '仍然必须调用', '把 false 当作仓库地址'], '不调用这个方法', '条件要求 true，false 不满足条件。'),
          R(['loop', 'variable', 'constant'], 'The loop changes count. MAX stays constant.（stays 是“保持”）哪项会被循环修改？', ['count', 'MAX', '两个都保持不变'], 'count', 'changes count 说明 count 会变；MAX stays constant 说明 MAX 保持固定。'),
        ], [
          R(['return', 'string', 'boolean'], 'The function returns "true" as a string. 返回值属于哪类？', ['字符串', '布尔值', '数组'], '字符串', '引号和 as a string 都明确说明是字符串，而不是布尔值 true。'),
          O(['condition', 'method', 'return'], '按中文流程排列说明：先检查条件，再调用方法，最后返回姓名。', ['Check the condition.', 'Call the method.', 'Return the name.'], '按给定流程先检查、再调用、最后返回。完整指令块不需要拆成单词。'),
        ]),
    ],
  },
  {
    id: 'P1-03', title: '终端、文件与开发工具', goal: '读懂文件路径和项目启动步骤。',
    description: '从文件位置到命令、安装、构建，再把步骤连成一段 README。',
    lessons: [
      lesson('P1-03-01', '文件放在哪里', '分清文件、文件夹、目录与路径。',
        'file 是文件；folder 是文件夹；directory 是目录，在本课的文件场景里与文件夹接近。path 是路径，告诉你位置。例如 src/main.js 是一个文件路径，其中 src 是目录，main.js 是文件名。Open this directory. 是“打开这个目录”；Copy the file path. 是“复制文件路径”。copy 表示“复制”。',
        ['file', 'folder', 'directory', 'path'], [
          M('path', 'path 在文件场景里表示什么？', ['路径', '提交历史', '一个布尔值'], '路径', '路径说明文件或目录的位置。'),
          R(['file', 'directory'], '路径 src/main.js 中，哪个部分是文件名？', ['main.js', 'src', '整个仓库的用户名'], 'main.js', '这里 src 是目录，main.js 是其中的文件。'),
          R(['folder', 'directory'], 'Open the project directory. 要打开什么？', ['项目所在目录', '一个提交说明', '函数的实参'], '项目所在目录', 'directory 在本课里指文件系统目录，可以理解为项目文件夹。'),
          F('file', '补出词：保存这个文件。', ['Save this ', '.'], 'file 是文件，Save this file. 是保存这个文件。'),
          R(['path'], 'Copy the file path, not the file text.（text 是“文字内容”）应该复制什么？', ['文件所在位置的路径', '文件里的全部文字', '文件夹的图标'], '文件所在位置的路径', 'path 是位置，text 是内容；说明明确要求前者。'),
        ], [
          M('folder', 'folder 表示什么？', ['文件夹', '数组元素', '远程请求'], '文件夹', 'folder 用来组织和存放文件，也可能包含其他文件夹。'),
          R(['directory', 'file', 'path'], 'Read config/app.json. 哪项符合这个路径？', ['读取 config 目录中的 app.json 文件', '修改名为 config 的函数', '提交所有 app 分支'], '读取 config 目录中的 app.json 文件', '斜线分隔目录与文件名；这里给出了要读的文件位置。'),
        ]),
      lesson('P1-03-02', '终端中的一条命令', '分清打开终端、输入命令与运行。',
        'terminal 是输入命令的终端，command 是让工具执行操作的命令，run 是运行。Open the terminal. 是“打开终端”；Run this command. 是“运行这条命令”。在示例 npm run start 中，start 是项目定义的脚本名；先理解说明要你在哪儿做什么，不把示例当成所有项目都适用的命令。',
        ['terminal', 'command', 'run'], [
          M('terminal', 'terminal 在开发工具语境里是什么？', ['输入命令的终端', '提交说明', '数组末尾的数'], '输入命令的终端', '终端让你输入命令并查看输出。'),
          R(['command', 'run'], 'Run this command. 这句话要求什么？', ['执行给出的命令', '只给命令改个名字', '把命令翻译成中文'], '执行给出的命令', 'run 表示运行，command 是被执行的命令。'),
          L('command', ['command', 'constant', 'commit']),
          O(['terminal', 'command', 'run'], '依次完成：打开终端，再运行命令。', ['Open the terminal.', 'Run this command.'], '先获得输入命令的终端，再运行给出的命令。'),
          R(['terminal'], 'Open a terminal in the project folder. 终端应在哪个位置打开？', ['项目文件夹中', '随便一个远程网页上', '提交说明文字中'], '项目文件夹中', 'in the project folder 限定终端的当前工作位置。'),
        ], [
          M('run', 'run 在 Run the app. 中表示什么？', ['运行', '删除', '复制'], '运行', '这里 run 是运行应用，不是日常语境的跑步。'),
          R(['command', 'run'], 'Do not run this command yet.（do not 是“不要”，yet 是“现在还”）现在应该做什么？', ['暂时不要执行', '立即连续执行三次', '把命令提交到仓库'], '暂时不要执行', 'do not 否定 run，yet 说明现在还不执行。'),
        ]),
      lesson('P1-03-03', '安装需要的软件包', '理解 package、install 与 dependency 的关系。',
        'package 是软件包，install 是安装，dependency 是当前项目需要的依赖项；dependencies 是复数。一个软件包可以成为项目的依赖项。Install the dependencies. 是“安装依赖项”。README 中写 Run the following command to install the dependencies.，是让你运行下面的命令来安装依赖；following 是“接下来的”。',
        ['package', 'install', 'dependency'], [
          M('dependency', 'dependency 表示什么？', ['项目需要的依赖项', '一个提交姓名', '电脑桌面的颜色'], '项目需要的依赖项', '依赖项是项目运行或开发时需要的其他组件。'),
          R(['install', 'package'], 'Install this package. 要进行哪个动作？', ['安装这个软件包', '只读它的名字', '删除所有项目'], '安装这个软件包', 'install 是安装；package 是软件包。'),
          R(['install', 'dependency'], 'Run the following command to install the dependencies. 运行下面命令的目的是什么？', ['安装项目依赖', '直接修改所有代码', '创建一个远程账号'], '安装项目依赖', 'to install 表示目的；dependencies 是需要安装的依赖项。'),
          F('install', '补出操作词：安装这个软件包。', ['', ' the package.'], 'install 是安装。'),
          R(['package', 'dependency'], 'This package is a dependency of the project. 哪项理解正确？', ['项目需要这个软件包', '软件包一定就是整个项目', '项目不使用这个软件包'], '项目需要这个软件包', 'a dependency of the project 表示它是这个项目的依赖项。'),
        ], [
          M('package', 'package 在安装说明里通常指什么？', ['软件包', '快递地址', '函数返回值'], '软件包', '相同词在不同语境有不同含义；这里是可安装的软件包。'),
          R(['install', 'dependency'], 'Install dependencies before you run the project.（before 是“在……之前”）哪一步在先？', ['安装依赖项', '运行项目', '推送所有提交'], '安装依赖项', '说明明确要求 install 在 run 之前。'),
        ]),
      lesson('P1-03-04', '构建与脚本', '区分 build、compile 和 script。',
        'build 是构建可运行或可发布的产物；compile 是编译代码，可能是构建中的一步；script 是执行一组操作的脚本。Run the build script. 是“运行构建脚本”。这里 build 修饰 script，指出脚本的用途。Compile this code. 是“编译这段代码”。构建完成不等于网站已经发布。',
        ['build', 'compile', 'script'], [
          M('compile', 'compile 表示什么？', ['编译', '克隆', '收藏'], '编译', 'compile 把代码转换成工具可以进一步使用的形式。'),
          R(['build', 'script'], 'Run the build script. 这里要运行哪个脚本？', ['负责构建的脚本', '负责改头像的脚本', '所有脚本都运行'], '负责构建的脚本', 'build 说明脚本用途，script 是要运行的对象。'),
          R(['compile', 'build'], 'The build compiles the code.（compiles 是 compile 的一种形式）编译与构建是什么关系？', ['这次构建包含编译代码', '编译就是克隆仓库', '构建不涉及任何代码'], '这次构建包含编译代码', '主语是 build；compiles the code 说明它执行了编译。'),
          W('build', '只写术语：生成项目运行或发布产物的“构建”。', 'build 表示构建。'),
          R(['script'], 'Run this script once.（once 是“一次”）要求运行几次？', ['一次', '一直循环', '每个文件各一次'], '一次', 'once 限定脚本运行次数为一次。'),
        ], [
          M('script', 'script 在开发工具中指什么？', ['脚本', '远程分支', '目录权限'], '脚本', '脚本用于执行一组指定操作。'),
          R(['build'], 'Build complete.（complete 是“完成”）仅凭这一提示能确认什么？', ['构建完成', '网站已自动发布上线', '所有用户已更新软件'], '构建完成', 'build complete 只报告构建完成，不报告发布或安装状态。'),
        ]),
      lesson('P1-03-05', '环境、配置与浏览器', '看懂在指定环境中启动项目和打开页面的说明。',
        'environment 是运行或开发环境；configuration 是配置，说明工具该如何工作。server 是提供服务的程序或机器，browser 是浏览器。Run the development server. 是“运行开发服务器”；Open the app in your browser. 是“在浏览器里打开应用”。development 表示“开发”，先把 development server 作为一个组合来理解。',
        ['environment', 'configuration', 'server', 'browser'], [
          M('environment', 'environment 在开发说明中通常是什么？', ['环境', '一条提交', '项目头像'], '环境', '开发环境或测试环境是代码工作时使用的条件和工具组合。'),
          R(['configuration'], 'Read the configuration before you change it.（it 指配置）修改前要先做什么？', ['读配置内容', '删除浏览器', '重新派生仓库'], '读配置内容', 'configuration 是配置；before 指明先读后改。'),
          R(['server', 'browser'], 'Run the development server. Open the app in your browser. 应先做什么？', ['启动开发服务器', '在浏览器里写提交说明', '立刻删除环境'], '启动开发服务器', '第一句先运行服务，第二句再在浏览器中打开应用。'),
          F('browser', '补出工具：在你的浏览器里打开应用。', ['Open the app in your ', '.'], 'browser 是浏览器。'),
          R(['environment', 'configuration'], 'Use the test environment with this configuration. 这份配置要在哪种环境使用？', ['测试环境', '任何环境都明确允许', 'GitHub 账号资料页'], '测试环境', 'test environment 是测试环境；说明限定了使用场景。'),
        ], [
          M('server', 'server 在 development server 中指什么？', ['提供开发服务的服务器程序', '代码里的一个形参', '只是一份说明文件'], '提供开发服务的服务器程序', 'server 提供服务，browser 用来访问页面，两者角色不同。'),
          R(['configuration', 'browser'], 'Configuration saved. Open your browser.（saved 是“已保存”）下一步是什么？', ['打开浏览器', '再次保存每个提交', '删除配置文件'], '打开浏览器', '第一句报告配置已保存，第二句给出打开浏览器的下一步动作。'),
        ]),
      lesson('P1-03-06', '照着 README 启动项目', '从一段新说明中识别目标、位置和顺序。',
        '这一课把仓库与工具两部分连起来。先读清每一步的动词和对象，再确认路径、环境与先后关系。说明中的 Install、Run、Open 并不可以随意互换。练习会给出明确顺序；遇到不熟悉的修饰词，先抓住已经学过的核心动作。这里不让你实际执行电脑命令，只练阅读理解。',
        ['directory', 'terminal', 'dependency', 'script', 'server', 'browser'], [
          O(['clone', 'install', 'dependency', 'run'], 'README 要求先获取仓库，再安装依赖，最后运行项目。排列完整指令。', ['Clone the repository.', 'Install the dependencies.', 'Run the project.'], '依照说明先 clone，再 install，最后 run。'),
          R(['directory', 'terminal'], 'Open a terminal in the app directory. Run the command there.（there 是“在那里”）there 指哪里？', ['app 所在目录', '任意新的浏览器标签页', '远程仓库的标题'], 'app 所在目录', 'there 回指前一句给出的 app directory。'),
          R(['build', 'script', 'dependency'], 'Install dependencies. Then run the build script. 第二步的目的是什么？', ['构建项目', '再次克隆仓库', '修改浏览器的语言'], '构建项目', 'build script 表明运行的是负责构建的脚本。'),
          R(['server', 'browser'], 'Run the development server. Then open the app in a browser. 哪一步负责提供开发服务？', ['第一步运行服务器', '第二步打开浏览器', '两步都是写提交说明'], '第一步运行服务器', 'server 提供服务，browser 用于访问应用。'),
          R(['file', 'path', 'configuration'], 'Read the configuration file at config/app.json.（at 指所在位置）config/app.json 在这里是什么？', ['配置文件的路径', '服务器的返回类型', '一条提交说明'], '配置文件的路径', 'configuration file 是配置文件；at 后提供文件位置。'),
        ], [
          R(['environment', 'compile'], 'In the test environment, compile the code first. 说明明确要求在哪个环境编译？', ['测试环境', '任何远程仓库', '浏览器书签'], '测试环境', 'in the test environment 给出环境，compile the code 给出动作。'),
          R(['package', 'dependency', 'run'], 'The package is installed. Run the project now.（now 是“现在”）当前下一步是什么？', ['运行项目', '再次安装所有软件包', '删除依赖项'], '运行项目', '第一句报告已经安装，第二句明确要求现在运行项目。'),
        ]),
    ],
  },
  {
    id: 'P1-04', title: '错误、测试与调试', goal: '读懂常见错误信息，并理解检查和修复的下一步。',
    description: '辨认错误与警告，读测试结果，再理解日志、问题单和缺失依赖的提示。',
    lessons: [
      lesson('P1-04-01', '错误不都是一回事', '区分 error、bug 与 warning。',
        'error 是错误或错误提示；bug 是程序中的缺陷；warning 是警告，提醒可能有问题，但不一定使操作立即停止。There is an error here. 是“这里有一个错误”；I found a bug. 是“我发现了一个程序错误”。found 表示“找到了”；File not found. 是常见提示“找不到文件”。',
        ['error', 'bug', 'warning'], [
          M('warning', 'warning 表示什么？', ['警告', '成功提交', '一个新数组'], '警告', 'warning 提醒可能存在问题，不自动等同于操作已经失败。'),
          R(['error', 'file'], 'Error: File not found. 提示主要说什么？', ['找不到文件', '文件已保存成功', '仓库没有分支'], '找不到文件', 'error 提示有错误，not found 表示没有找到。'),
          L('error', ['error', 'array', 'origin']),
          R(['bug'], 'I found a bug in this function. 问题在哪里？', ['这个函数中', '只在 README 标题里', '只在 GitHub 账号姓名里'], '这个函数中', 'a bug 是程序缺陷；in this function 给出了位置。'),
          R(['warning', 'error'], 'Warning: check this configuration.（check 是“检查”）仅凭 warning 能否断定操作已停止？', ['不能，需看后续状态', '能，所有警告都等于失败', '能，项目一定已被删除'], '不能，需看后续状态', 'warning 是警告；它本身不等于明确的失败或停止结果。'),
        ], [
          M('bug', 'bug 在程序语境中表示什么？', ['程序缺陷', '浏览器名称', '项目许可证'], '程序缺陷', 'bug 在此处指程序行为或实现中的问题。'),
          R(['error', 'warning'], '两行输出：Warning: check the path. Error: File not found. 哪行明确报告找不到文件？', ['第二行 Error', '第一行 Warning', '两行都说文件已保存'], '第二行 Error', '第二行才出现 File not found；第一行只是提醒检查路径。'),
        ]),
      lesson('P1-04-02', '测试通过了吗', '看懂 test、fail 和 pass 的状态。',
        'test 是测试；pass 是通过；fail 是失败。测试结果常写 passed（已通过）和 failed（已失败）。All tests passed. 是“所有测试都通过了”；One test failed. 是“一个测试失败了”。all 是“全部”，one 是“一个”。测试通过说明这些检查通过，并不能单凭一句话推断整个软件绝无错误。',
        ['test', 'fail', 'pass'], [
          M('pass', 'pass 在测试结果里表示什么？', ['通过', '克隆', '提交'], '通过', '测试语境的 pass 表示检查通过。'),
          R(['test', 'fail'], 'One test failed. 当前测试结果是什么？', ['有一个测试失败', '所有测试都通过', '没有运行任何测试'], '有一个测试失败', 'one test 是一个测试；failed 表示失败。'),
          R(['test', 'pass'], 'All tests passed. 哪个结论最准确？', ['本次运行的测试全部通过', '软件从此不会有任何缺陷', '代码已经自动发布'], '本次运行的测试全部通过', 'passed 是通过；这句话没有证明发布或绝无缺陷。'),
          F('fail', '补出词：这个测试可能失败。', ['This test may ', '.'], 'may fail 是可能失败，fail 使用基本形式。'),
          R(['pass', 'fail'], '输出：2 passed, 1 failed。哪项符合？', ['两个通过，一个失败', '一个通过，两个失败', '三个全部通过'], '两个通过，一个失败', '数字分别跟在 passed 和 failed 的数量前。'),
        ], [
          M('test', 'test 表示什么？', ['测试', '目录位置', '远程副本'], '测试', '测试用于检查某些行为是否符合预期。'),
          R(['fail', 'pass'], 'The test did not pass.（did not 表示“没有”）能否把它记为通过？', ['不能，这里明确说没有通过', '能，只要出现 pass 就算通过', '能，因为没有看到 error'], '不能，这里明确说没有通过', '否定词 not 改变整个短语含义，不能只识别 pass。'),
        ]),
      lesson('P1-04-03', '读日志再定位', '理解 debug、log 与 fix 的职责。',
        'debug 是调试，用来定位和理解问题；log 是日志或记录日志；fix 是修复。Read the log to debug the error. 是“读日志来调试这个错误”。Fix the bug, then run the test. 是“修复缺陷，然后运行测试”。调试是调查过程，fix 才说明实施修复；还需要测试结果确认相应行为。',
        ['debug', 'log', 'fix'], [
          M('log', 'log 在开发工具里通常是什么？', ['日志或日志记录', '主分支名称', '函数形参'], '日志或日志记录', '日志记录运行时发生的事件，帮助定位问题。'),
          R(['debug', 'log'], 'Read the log to debug the error. 读日志的目的是什么？', ['帮助定位和理解错误', '把错误改名成日志', '直接发布项目'], '帮助定位和理解错误', 'to debug 表明读日志用于调试和定位问题。'),
          R(['fix', 'bug'], 'Fix this bug. 这条要求到哪一步？', ['修改程序来修复缺陷', '只给缺陷起个名字', '只把日志打开就结束'], '修改程序来修复缺陷', 'fix 是修复，不只是发现或查看问题。'),
          W('log', '只写一个词：用于查看程序运行记录的“日志”。', 'log 是日志；这里只写单词，不需要句子。'),
          O(['fix', 'test'], '按要求排列：先修复缺陷，再运行测试检查。', ['Fix the bug.', 'Run the test.'], '修复后通过测试检查相关行为；不能把打开日志当作修复完成。'),
        ], [
          M('debug', 'debug 表示什么？', ['调试', '推送', '安装'], '调试', '调试是观察和定位程序问题的过程。'),
          R(['fix', 'log', 'test'], 'The log shows an error. Fix it and run the test again.（again 是“再次”）修复后要做什么？', ['再次运行测试', '直接删掉所有日志', '只保存一个截图'], '再次运行测试', 'run the test again 要求重新检查修复后的行为。'),
        ]),
      lesson('P1-04-04', '把问题写清楚', '区分 issue、请求和 pull request 的语境。',
        'issue 是仓库中的问题单，可记录缺陷或讨论任务。request 是请求；Send a request to the server. 是“向服务器发送请求”。pull request 则是请求合并一组代码修改，不能逐字理解成服务器请求。Open an issue for this bug. 是“为这个缺陷创建问题单”。先判断它出现在服务器通信还是代码协作场景。',
        ['issue', 'request', 'pull request'], [
          M('issue', 'issue 在 GitHub 仓库里通常指什么？', ['问题单或议题', '一个布尔值', '安装的软件包'], '问题单或议题', 'issue 可用于记录缺陷、提出需求和讨论任务。'),
          R(['request', 'server'], 'Send a request to the server. 请求发给谁？', ['服务器', 'Git 的本地提交历史', '一个整数'], '服务器', 'to the server 指向请求的接收方服务器。'),
          R(['pull request'], 'Review this pull request.（review 是“检查”）这里主要在检查什么？', ['一组请求合并的代码修改', '一条让服务器返回数据的请求', '电脑里的所有文件夹'], '一组请求合并的代码修改', 'pull request 是代码协作中的合并请求，不等同于普通服务器请求。'),
          F('issue', '补出词：为这个程序错误创建问题单。', ['Open an ', ' for this bug.'], 'issue 是问题单；Open an issue 表示创建一个问题单。'),
          R(['issue', 'pull request'], 'The issue describes the bug. The pull request fixes it.（describes 是“描述”）哪一项提供修复修改？', ['pull request', 'issue 的标题本身', '服务器地址'], 'pull request', 'issue 描述问题；此处 pull request 包含针对问题的修复。'),
        ], [
          M('request', 'request 的基本含义是什么？', ['请求', '提交完成', '文件路径'], '请求', 'request 表示请求，具体类型需要结合上下文。'),
          R(['request', 'pull request'], 'A request gets data from the server. A pull request proposes code changes.（gets data 是“获取数据”，proposes 是“提议”）哪项与合并代码有关？', ['pull request', '第一句的数据请求', '两个都只是在读日志'], 'pull request', 'pull request 是提出代码修改供评审合并；第一句讲服务器通信。'),
        ]),
      lesson('P1-04-05', '读懂缺失和权限提示', '从错误句中找出缺了什么或什么被拒绝。',
        'module 是模块，permission 是权限。Cannot find module ... 表示“找不到模块……”；Permission denied. 表示“权限被拒绝”。cannot 是“不能”，find 是“找到”，denied 是“被拒绝”，missing 是“缺少的”。Build failed because a dependency is missing. 是“构建失败，因为缺少一个依赖项”。because 后面给出原因；先理解信息，不凭一句错误猜唯一修复方法。',
        ['module', 'permission'], [
          M('module', 'module 在代码中表示什么？', ['模块', '用户名', '一次推送'], '模块', '模块把相关代码组织为可使用的部分。'),
          R(['module'], "Cannot find module 'react'. 这条信息说明什么？", ['当前找不到 react 模块', 'react 模块已成功构建', '所有测试已经通过'], '当前找不到 react 模块', 'cannot find 表示找不到；它未单独说明是未安装、路径错误还是其他原因。'),
          R(['permission'], 'Permission denied. 这条提示主要属于哪一类问题？', ['访问或操作权限被拒绝', '文件夹名称太短', '测试已经通过'], '访问或操作权限被拒绝', 'permission 是权限，denied 表示被拒绝；需要结合具体操作检查授权。'),
          F('module', '补出词：找不到名为 react 的模块。', ['Cannot find ', " 'react'."], 'module 是模块；模块名 react 本身保持不变。'),
          R(['build', 'fail', 'dependency'], 'Build failed because a dependency is missing. 构建为什么失败？', ['缺少依赖项', '所有测试已经通过', 'README 已阅读完'], '缺少依赖项', 'because 后明确给出原因：a dependency is missing。'),
        ], [
          M('permission', 'permission 表示什么？', ['权限', '常量', '提交说明'], '权限', '权限决定当前用户或程序是否可以执行某项操作。'),
          R(['file', 'path', 'module'], "File not found: config/app.json\nCannot find module 'react'.\n哪条信息明确给出了文件路径？", ['第一条', '第二条', '两条都没有任何名字'], '第一条', 'config/app.json 是文件路径；第二条给出的是模块名 react。'),
        ]),
      lesson('P1-04-06', '读一次失败报告', '综合读懂错误、原因、修复流程和测试结果。',
        '最后一课使用新的短报告。按顺序找：哪个动作失败，错误对象是什么，原因是否明确，下一步要检查还是修改，最终结果是否通过。不要看到 warning 就认定失败，也不要看到 fix 就认为测试已通过。根据报告中实际给出的信息判断；没有写出的结果，不替它补出来。',
        ['error', 'warning', 'log', 'test', 'fail', 'fix'], [
          R(['build', 'fail', 'dependency'], 'Build failed. One dependency is missing. Install dependencies, then build again. 报告给出的下一步是什么？', ['安装依赖后重新构建', '直接认定构建成功', '删除所有模块'], '安装依赖后重新构建', '报告明确指出缺失依赖，并要求 install 后再次 build。'),
          R(['warning', 'test', 'pass'], 'Warning: check the configuration.\nAll tests passed.\n对这份输出，哪项描述准确？', ['有一条配置警告，测试全部通过', '有警告就代表所有测试失败', '没有任何需要注意的信息'], '有一条配置警告，测试全部通过', 'warning 和测试结果要分别读取；这两条信息可以同时成立。'),
          R(['module', 'log', 'debug'], "Error: Cannot find module 'react'. Read the log to debug it. 下一步先做什么？", ['读日志帮助定位找不到模块的原因', '把 react 当作分支名推送', '直接认定问题已经修好'], '读日志帮助定位找不到模块的原因', '报告要求 read the log 来 debug；目前没有给出修复成功的结果。'),
          O(['issue', 'fix', 'test'], '报告要求：先读问题单理解缺陷，再修复，最后运行测试。按顺序排列。', ['Read the issue.', 'Fix the bug.', 'Run the tests.'], '先理解问题，再修改程序，最后检查行为。'),
          R(['fix', 'test', 'fail'], 'The bug is fixed. One test still fails.（still 是“仍然”）现在可以确认什么？', ['报告称缺陷已修复，但仍有测试失败', '所有测试已经通过', '项目已经自动发布'], '报告称缺陷已修复，但仍有测试失败', '修复声明和实际测试结果应分别读取；still fails 是仍然失败。'),
        ], [
          R(['permission', 'file'], 'Error: Permission denied when opening the file.（when opening 是“打开……时”）发生了什么？', ['打开文件时权限被拒绝', '文件已经保存成功', '找不到名为 permission 的模块'], '打开文件时权限被拒绝', 'permission denied 描述权限问题，when opening the file 给出发生阶段。'),
          R(['issue', 'pull request', 'test', 'pass'], 'The issue has a fix in this pull request. All tests passed. 哪项同时符合两句？', ['修复在该合并请求中，本次测试全部通过', '问题单已自动关闭并发布上线', '所有模块都无需再测试'], '修复在该合并请求中，本次测试全部通过', '报告明确提供了修复位置和测试结果，没有说明合并、关闭或发布状态。'),
        ]),
    ],
  },
]

export const programmingLessons = programmingUnits.flatMap(unit => unit.lessons)
export const programmingPhrases = [...new Map(programmingLessons.flatMap(item => item.phrases).map(phrase => [phrase.id, phrase])).values()]
