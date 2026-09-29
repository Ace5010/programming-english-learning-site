import type { DailyPhrase } from './dailyCourse.ts';

export type SentenceGuide = {
  text: string;
  parts: { text: string; meaning: string }[];
  tip: string;
  topic: string;
  link: string;
};
const guides = new Map<string, SentenceGuide>();
const links: Record<string, string> = {
  commands: '动作词开头的句子', 'word-order': '句子里的动作与对象', be: '怎样使用 am、is、are',
  'be-question': '怎样把陈述变成提问', 'be-negative': '怎样表达否定', wh: '怎样询问谁、什么和哪里',
  contractions: '带撇号的缩写', articles: '怎样使用 a 和 an', plural: '一个和多个的区别',
  there: '怎样表达“这里有”', can: '怎样表达“可以”', past: '怎样说已经发生的事',
  'word-concepts': '单词、词组和句子的区别',
};
function add(chunks: string, meanings: string, tip: string, topic = 'word-order') {
  const texts = chunks.split('|');
  const descriptions = meanings.split('|');
  if (texts.length !== descriptions.length) throw new Error(`句子讲解分段不匹配：${chunks}`);
  const text = texts.join(' ');
  guides.set(text, { text, parts: texts.map((text, index) => ({ text, meaning: descriptions[index] })), tip, topic, link: links[topic] });
}

// Authored for the existing course sentences, not a general English parser.
const commands = [
  ['Open|this repository.', '打开：要做的动作|这个代码仓库：要打开什么'],
  ['Open|this project.', '打开：要做的动作|这个项目：要打开什么'],
  ['Read|this code.', '阅读：要做的动作|这段代码：要读什么'],
  ['Read|the README|for help.', '阅读：要做的动作|项目说明文件：要读什么|获取帮助：说明阅读的目的'],
  ['Clone|this project.', '克隆：要做的动作|这个项目：要克隆什么'],
  ['Fork|this project|on GitHub.', '复刻：要做的动作|这个项目：要复刻什么|在 GitHub 上：说明操作的平台'],
  ['Make|a new branch.', '创建：要做的动作|一个新分支：要创建什么'],
  ['Use|checkout|to change branches.', '使用：要做的动作|checkout 命令：用什么|切换分支：说明使用的目的'],
  ['Switch|to the main branch.', '切换：要做的动作|到主分支：说明切换的目标'],
  ['Change|this code.', '修改：要做的动作|这段代码：要修改什么'],
  ['Commit|your code.', '提交：要做的动作|你的代码：要提交什么'],
  ['Write|a commit message.', '写：要做的动作|一条提交说明：要写什么'],
  ['Push|your code|to GitHub.', '推送：要做的动作|你的代码：要推送什么|到 GitHub：说明推送的目标'],
  ['Pull|the new code.', '拉取：要做的动作|新代码：要拉取什么'],
  ['Push|your code|to origin.', '推送：要做的动作|你的代码：要推送什么|到 origin：说明目标远程仓库'],
  ['Put|your name|in this variable.', '放入：要做的动作|你的名字：要放入什么|这个变量中：说明存放位置'],
  ['Use|your name|as the argument.', '使用：要做的动作|你的名字：用什么|作为实参：说明名字在这里的用途'],
  ['Return|the name.', '返回：要做的动作|名字：要返回什么'],
  ['Make|a class|for users.', '创建：要做的动作|一个类：要创建什么|用于用户：说明类的用途'],
  ['Change|the name property.', '更改：要做的动作|name 属性：要改哪个属性'],
  ['Check|this condition|first.', '检查：要做的动作|这个条件：要检查什么|先：说明做事的顺序'],
  ['Save|this file.', '保存：要做的动作|这个文件：要保存什么'],
  ['Make|a new folder.', '创建：要做的动作|一个新文件夹：要创建什么'],
  ['Open|this directory.', '打开：要做的动作|这个目录：要打开什么'],
  ['Copy|the file path.', '复制：要做的动作|文件路径：要复制什么'],
  ['Open|a terminal|here.', '打开：要做的动作|一个终端：要打开什么|在这里：说明位置'],
  ['Run|this command.', '运行：要做的动作|这条命令：要运行什么'],
  ['Run|the app.', '运行：要做的动作|这个应用：要运行什么'],
  ['Install|this app.', '安装：要做的动作|这个应用：要安装什么'],
  ['Build|the app.', '构建：要做的动作|这个应用：要构建什么'],
  ['Compile|this code.', '编译：要做的动作|这段代码：要编译什么'],
  ['Run|this script|once.', '运行：要做的动作|这个脚本：要运行什么|一次：说明运行次数'],
  ['Set up|the test environment.', '搭建：两个词合起来表示一个动作|测试环境：要搭建什么'],
  ['Save|this configuration.', '保存：要做的动作|这个配置：要保存什么'],
  ['Open|your browser.', '打开：要做的动作|你的浏览器：要打开什么'],
  ['Read|this warning.', '阅读：要做的动作|这条警告：要读什么'],
  ['Write|a test|for this code.', '编写：要做的动作|一个测试：要写什么|针对这段代码：说明测试对象'],
  ['Debug|this code.', '调试：要做的动作|这段代码：要调试什么'],
  ['Read|the log.', '阅读：要做的动作|日志：要读什么'],
  ['Fix|this error.', '修复：要做的动作|这个错误：要修复什么'],
  ['Open|an issue|for this bug.', '创建：这里指新建问题单|一个问题单：要创建什么|针对这个程序错误：说明报告的问题'],
  ['Send|a request|for help.', '发送：要做的动作|一个请求：要发送什么|寻求帮助：说明请求的目的'],
  ['Please|check|my pull request.', '请：让请求更礼貌|检查：要做的动作|我的拉取请求：要检查什么'],
  ['Add|this module|to your app.', '添加：要做的动作|这个模块：要添加什么|到你的应用中：说明添加到哪里'],
  ['Ask for|permission|first.', '请求：两个词合起来表示一个动作|权限：要请求什么|先：说明做事的顺序'],
];
for (const [chunks, meanings] of commands) add(chunks, meanings, '这类操作说明通常省略“你”，直接说要做的动作，再说明对象、位置或用途。', 'commands');
for (const [chunks, meanings] of [
  ['This remote|has|our code.', '这个远程仓库：在说什么|有、存有：连接仓库和内容|我们的代码：仓库里有什么'],
  ['This function|adds|two numbers.', '这个函数：在说什么|相加：函数做的动作|两个数：相加的对象'],
  ['This function|has|one parameter.', '这个函数：在说什么|有：连接函数和参数|一个参数：说明有什么'],
  ['This array|has|three names.', '这个数组：在说什么|有：连接数组和内容|三个名字：数组里有什么'],
  ['This object|has|a name.', '这个对象：在说什么|有：连接对象和属性|一个名字：说明有什么'],
  ['This loop|runs|ten times.', '这个循环：在说什么|运行：循环做的动作|十次：说明运行次数'],
  ['This method|saves|the file.', '这个方法：在说什么|保存：方法做的动作|文件：保存的对象'],
  ['This app|needs|one dependency.', '这个应用：在说什么|需要：连接应用和所需内容|一个依赖项：说明需要什么'],
]) add(chunks, meanings, '先找到句子在说什么，再看它做什么或拥有什么；最后的部分补充对象或数量。');
for (const [chunks, meanings] of [
  ['This constant|is|always five.', '这个常量：在说什么|连接常量和它的值|始终是五：说明数值保持不变'],
  ['Your name|is|a string.', '你的名字：在说什么|是：连接名字和数据类型|一个字符串：说明数据类型'],
  ['Five|is|an integer.', '五：在说哪个数|是：连接数值和数据类型|一个整数：说明数据类型'],
  ['This package|is|free.', '这个软件包：在说什么|连接软件包和它的特点|免费的：说明软件包的特点'],
  ['The server|is|down.', '服务器：在说什么|连接服务器和它的状态|无法正常运行：这里表示服务不可用'],
]) add(chunks, meanings, '这里不是发出操作指令，而是在说明前面的东西是什么或处于什么状态。', 'be');
add('A boolean|can be|true or false.', '一个布尔值：在说什么|可以是：说明可能取的值|真或假：两个可选值', '后半句列出布尔值的两种取值，“或”连接这两个选择。', 'can');
add('There is|an error|here.', '有：引出存在的东西|一个错误：有什么|在这里：说明位置', '这句话先说“有”，再说有什么，最后补充在哪里。', 'there');
add('I|found|a bug.', '我：谁发现的|发现了：动作已经发生|一个程序错误：发现了什么', '这里的动作已经发生，所以使用表示过去的动词形式。', 'past');
add('This test|may fail.', '这个测试：在说什么|可能失败：说明一种可能的结果', '“可能”不等于一定；读结果说明时要留意这种程度差别。');
add('This test|should pass.', '这个测试：在说什么|应该通过：说明预期的结果', '这里说的是预期结果，还不是已经通过的测试报告。');

for (const [text, use] of [['Hello!', '见面时打招呼，较通用。'], ['Hi!', '见面时打招呼，较随意。'], ['Goodbye!', '离开时告别。'], ['Bye!', '离开时告别，较随意。']]) {
  add(text, use, '这种短表达可以单独使用。先把声音和使用场景联系起来，不需要补成更长的句子。', 'word-concepts');
}
const people: Record<string, string> = { I: '我', you: '你', he: '他', she: '她', it: '它', we: '我们', they: '他们', this: '这', that: '那', these: '这些', those: '那些', 'My name': '我的名字' };
const endings: Record<string, string> = {
  Ben: 'Ben：说明姓名', Mia: 'Mia：说明姓名', 'from China': '来自中国：说明来源', 'from Japan': '来自日本：说明来源', 'from the US': '来自美国：这里的美国名称前保留 the',
  Chinese: '中国人：说明国籍', Japanese: '日本人：说明国籍', American: '美国人：说明国籍',
  'a student': '一名学生：说明身份，单数前保留 a', 'a teacher': '一名老师：说明身份，单数前保留 a',
  students: '学生们：复数形式说明不止一人', teachers: '老师们：复数形式说明不止一人', happy: '高兴的：说明状态', tired: '累的：说明状态',
  'a book': '一本书：说明物品，单数前保留 a', 'a pen': '一支笔：说明物品，单数前保留 a', 'a bag': '一个包：说明物品，单数前保留 a',
  'an apple': '一个苹果：后一个词以元音开头发音，用 an', 'an egg': '一个鸡蛋：后一个词以元音开头发音，用 an',
  books: '书：复数形式说明不止一本', pens: '笔：复数形式说明不止一支', apples: '苹果：复数形式说明不止一个',
};
const subjectMeaning = (subject: string, end: string) => subject.toLowerCase() === 'they' && /^(books|pens|apples)$/.test(end) ? '它们' : people[subject] ?? people[subject.toLowerCase()];

/** Only called for exact phrases already selected by the curriculum. */
export function sentenceGuide(phrase: DailyPhrase): SentenceGuide | undefined {
  if (guides.has(phrase.en)) return guides.get(phrase.en);
  const text = phrase.en;
  const statement = /^(I|He|She|We|They|It|This|That|These|Those|My name) (am|is|are) (not )?(.+)\.$/.exec(text);
  if (statement && endings[statement[4]]) {
    const [, subject, be, negative, end] = statement;
    add(`${subject}|${be}${negative ? ' not' : ''}|${end}.`, `${subjectMeaning(subject, end)}：句子在说谁或什么|${negative ? '加上 not，表示否定' : `${be}：与前面的人或物搭配，连接后面的信息`}|${endings[end]}`,
      negative ? '否定词放在 am、is、are 后面，否定后面的身份、状态或来源。' : '先说人或物，再用 am、is、are 接上姓名、身份、状态或来源。', negative ? 'be-negative' : /^an? /.test(end) ? 'articles' : /^(students|teachers|books|pens|apples)$/.test(end) ? 'plural' : 'be');
  }
  const contracted = /^(I'm) (.+)\.$/.exec(text);
  if (contracted && (endings[contracted[2]] || contracted[2] === 'not')) add(`I'm|${contracted[2]}.`, `把“我”和与它搭配的 am 缩在一起|${endings[contracted[2]] ?? '不是：否定对方刚才询问的情况'}`, '撇号表示省略了字母；缩写和完整说法表达相同的意思。', 'contractions');
  const question = /^(Are|Is) (you|he|she|that) (.+)\?$/.exec(text);
  if (question && endings[question[3]]) {
    const [, be, subject, end] = question;
    add(`${be}|${subject}|${end}?`, `${be} 放在前面，表示提问|${subjectMeaning(subject, end)}：问的是谁或什么|${endings[end]}`, '把 is 或 are 放到人或物前面，就能询问这个信息是否属实。', 'be-question');
  }
  const yes = /^Yes, (I am|he is|it is)\.$/.exec(text);
  if (yes) add(`Yes,|${yes[1]}.`, `是的：先作肯定回应|${yes[1].startsWith('I') ? '我' : yes[1].startsWith('he') ? '他' : '它'}是：接上人称和对应的动词`, '肯定的简短回答保留完整的 am 或 is，不把最后两个词缩写。', 'be-question');
  const no = /^No, (I'm|she isn't|it isn't)(?: (.+))?\.$/.exec(text);
  if (no) {
    const tail = no[2];
    if (!tail) add(`No,|${no[1]}.`, `不：先作否定回应|${no[1].startsWith('she') ? '她' : '它'}不是：用缩写表示否定`, '否定回答可以使用带撇号的缩写；这里省略了对方已经说过的信息。', 'be-negative');
    else if (endings[tail] || tail === 'not') add(`No,|${no[1]}|${tail}.`, `不是：先回应对方|我：带有 am 的缩写|${endings[tail] ?? '不是：否定对方刚才询问的情况'}`, tail === 'not' ? '先说“不”，再用否定的简短回答回应刚才的问题。' : '先否定对方的猜测，再说出正确的姓名或国籍。', 'be-negative');
  }
  return guides.get(text);
}
add("What's|your name?", '是什么：带撇号的缩写|你的名字：询问的内容', '这句话问名字，回答时可以直接介绍自己的姓名。', 'wh');
add('Where|are you|from?', '哪里：询问地点|你：这里将 are 放在人称前|来自：和前面的“哪里”合起来询问来源', '这句话询问来自哪里；回答时再说出具体地点。', 'wh');
for (const [person, meaning] of [['he', '他'], ['she', '她']]) add(`Who|is ${person}?`, `谁：询问身份|${meaning}是：说明问的是哪个人`, '用“谁”询问人物身份，回答时说明这个人是谁。', 'wh');
for (const [thing, meaning] of [['it', '它'], ['this', '这']]) add(`What|is ${thing}?`, `什么：询问名称|${meaning}是：说明问的是哪个东西`, '这句话问东西的名称；回答时说出它是什么。', 'wh');
for (const [chunks, meanings, tip, topic] of [
  ["Hello!|I'm Mia.|What's your name?", '打招呼|介绍自己的姓名|询问对方姓名', '对话先打招呼，再介绍自己，最后把话题交给对方。', 'wh'],
  ['Hi!|My name is Ben.|Are you Mia?', '打招呼|介绍自己的姓名|确认对方是不是 Mia', '最后一句是在确认姓名，通常先用“是”或“不是”回应。', 'be-question'],
  ["Hello!|I'm Ben.|I'm from China.", '打招呼|介绍姓名|说明来自中国', '每句话只补充一条信息，先说姓名，再说来源。', 'be'],
  ["Hi!|My name is Mia.|I'm from Japan.", '打招呼|介绍姓名|说明来自日本', '姓名和来源分开说，能让介绍更清楚。', 'be'],
  ['He is Ben.|He is from China.|He is a teacher.', '介绍他的姓名|说明他的来源|说明他的职业', '同一个人贯穿三句话，按姓名、来源、身份逐条介绍。', 'be'],
  ['She is Mia.|She is from Japan.|She is a student.', '介绍她的姓名|说明她的来源|说明她的身份', '同一个人贯穿三句话，按姓名、来源、身份逐条介绍。', 'be'],
  ['This is a book.|That is a bag.|These are pens.', '指近处的一本书|指较远处的一个包|指近处的多支笔', '前两句说单件物品，最后一句说多件物品，所以动词也随之变化。', 'plural'],
]) add(chunks, meanings, tip, topic);
