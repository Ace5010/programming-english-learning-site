import { vocabulary } from './vocabulary.ts';
import type { WordStudyInfo } from './CourseWordCards';

const words = new Map(vocabulary.map(word => [`word-${word.id}`, word]));

// Chinese reading guidance for the existing course targets. English examples
// and their recordings continue to come from the original vocabulary IDs.
const usage: Record<string, string> = {
  repository: '用来集中保存项目文件和修改历史。阅读项目页面时，可以把它理解成整个代码仓库。',
  project: '指正在开发的一个项目，通常包含代码、说明和配置等文件。这里学习的是名词“项目”。',
  code: '指写给电脑执行的程序内容。在项目说明中，常见于阅读、修改或提交代码的要求。',
  clone: '把一个已有仓库复制到自己的电脑上，通常连同它的修改历史一起复制。',
  fork: '从已有仓库派生出一份属于自己的仓库，方便独立修改，再向原项目提出合并请求。',
  readme: '项目的说明文件。第一次打开项目时，可以先从这里了解用途和使用步骤。',
  branch: '同一个仓库中的一条开发分支，让你可以在其中修改代码，再决定是否合并。',
  checkout: '在本课中指切换到另一条分支。阅读命令说明时，注意后面写的是要切换到的分支名。',
  main: '常见的主分支名称。它是分支的名字，看到切换到主分支的要求时，先认出这个名字。',
  commit: '把本次修改保存成一条提交记录。它既可以表示“提交”这个动作，也可以指一条记录。',
  change: '表示修改某段内容，也可以指已经发生的一处修改。阅读时注意它后面改的是代码还是文件。',
  message: '用文字说明一件事。在提交代码的语境中，通常指简短解释本次修改的提交说明。',
  push: '把本地的提交推送到远程仓库，让远程仓库收到这些修改。',
  pull: '从远程仓库拉取修改并整合到本地。阅读协作步骤时，常见于获取别人提交的新代码。',
  remote: '这里指与本地仓库关联的远程仓库，代码通常放在另一台电脑或托管网站上。',
  origin: '常见的远程仓库名称。它是一个名字，具体指向哪个仓库取决于项目的设置。',
  'pull request': '向项目提出合并代码修改的请求，供别人查看、讨论和检查这些修改。',
  issue: '用来记录问题、提出需求或讨论事项的问题单。它是沟通记录，未必表示程序出了错误。',
  function: '完成某项工作的函数。阅读代码时，可以先看它接收什么输入、产生什么结果。',
  variable: '用一个名字保存数据的变量。这里可以把它理解成一个有名字、可以存放值的位置。',
  constant: '在本课中指值保持固定的常量，用于保存不需要重新赋值的内容。',
  parameter: '写在函数定义里的形参，用来接收调用函数时传入的值。',
  argument: '调用函数时实际传进去的值，称为实参。先分清是在定义函数，还是在调用函数。',
  return: '把一个结果从函数中返回给调用它的地方。在代码说明中，注意返回的具体内容。',
  array: '把多个值放在一起的数组。阅读例句时，可以把它理解成一个按顺序保存内容的列表。',
  string: '表示文字的字符串，名字、一句话或一段文本都可以作为字符串保存。',
  integer: '没有小数部分的整数。在描述数据类型时，它用来说明保存的是什么样的数。',
  boolean: '只有真、假两种取值的布尔值，常用来表示某个判断是否成立。',
  class: '描述一类对象的类，可以把它理解成创建这些对象时使用的一份定义。',
  object: '保存相关数据的对象。阅读例句时，注意这个对象具有哪些名字、值或属性。',
  property: '属于对象的一项属性，例如名字。它用来描述对象保存的某个具体信息。',
  condition: '决定某件事是否执行的条件。阅读判断语句时，先弄清条件成立时会发生什么。',
  loop: '把一段操作重复执行的循环。例句里的次数说明这段操作会重复多少遍。',
  method: '在本课中指属于类或对象的方法，用来完成某项操作。',
  file: '保存内容的文件，可以装着代码、文字或配置。注意说明要求打开、保存还是修改它。',
  folder: '放置文件的文件夹。项目中的多个文件可以按用途放进不同文件夹。',
  directory: '文件系统中的目录，通常可以理解成文件夹。项目文档里常用它说明文件所在的位置。',
  path: '文件或目录的位置写法。阅读步骤时，用它来找到需要打开的内容。',
  terminal: '输入命令、查看输出的终端窗口。项目说明里的运行步骤经常要求先打开终端。',
  command: '让电脑执行某项操作的一条命令。阅读时先认出它要安装、运行还是构建什么。',
  run: '让程序开始执行。在使用步骤中，它常表示运行应用、命令或脚本。',
  package: '可以安装或引入的软件包，里面通常包含已经整理好的代码和资源。',
  dependency: '项目运行或开发时依赖的其他软件包。安装项目时，通常也需要把这些依赖安装好。',
  install: '把软件或软件包安装到环境中。在项目步骤中，它常出现在首次运行之前。',
  build: '把源码和资源处理成可以使用的构建产物，通常是项目发布前的一步。',
  compile: '把源码翻译成另一种可执行或可使用的形式，称为编译。',
  script: '用于执行一组操作的脚本。它可以帮助完成运行、检查或构建等步骤。',
  environment: '程序运行或测试所处的环境，包括它需要的软件和设置。',
  configuration: '控制程序怎样工作的配置。在文档中，常见于保存或调整项目设置的说明。',
  browser: '打开和浏览网页的软件。运行网页项目后，通常用浏览器查看页面。',
  server: '为其他程序提供服务的服务器。例句说它无法正常运行，表示当前服务不可用。',
  request: '向另一个程序或服务发出的请求，用来获取数据或请对方执行操作。',
  error: '出现的错误，可能来自代码、输入或运行环境。阅读报错时先找出具体出了什么问题。',
  warning: '需要留意的警告。它提醒你可能存在问题，未必意味着程序已经停止。',
  bug: '程序中的缺陷，可能让程序表现与预期不一致。发现后通常需要定位并修复。',
  test: '检查代码行为是否符合预期的测试。它既可以指检查动作，也可以指一项测试。',
  fail: '这里表示测试失败、没有通过。阅读结果时，意味着实际表现没有满足这项检查。',
  pass: '这里表示测试通过。它只说明这项检查满足要求，不代表所有问题都已解决。',
  log: '记录运行过程和事件的日志，可以帮助你了解程序做过什么、在哪里出现问题。',
  debug: '查找和定位程序问题的调试过程。常见做法是查看运行过程或变量的值。',
  fix: '修复已经发现的问题。在任务说明中，注意它要求修复的是哪一个错误或缺陷。',
  module: '按功能组织的一块代码模块，可以在应用中引入或组合使用。',
  permission: '执行某项操作所需的权限，例如读取文件。权限不足时，程序可能拒绝该操作。',
};

const contrasts: Record<string, string> = {
  clone: '区分一下：克隆通常是复制到自己的电脑；派生仓库通常是在托管网站上建立自己的一份。',
  fork: '区分一下：派生仓库保留自己的一份仓库；克隆强调把仓库复制到自己的电脑。',
  parameter: '区分一下：形参是定义里的接收位置；实参是调用时实际传入的值。',
  argument: '区分一下：实参是实际传入的值；形参是函数定义里用来接收它的位置。',
};

// Course-specific readings: the noun sense of project and standard diphthongs.
// https://dictionary.cambridge.org/us/pronunciation/english/project
// https://dictionary.cambridge.org/dictionary/english/change
// https://dictionary.cambridge.org/us/dictionary/essential-american-english/fail
const coursePhonetics: Record<string, string> = { project: 'ˈprɑːdʒekt', change: 'tʃeɪndʒ', fail: 'feɪl' };

export function programmingStudyInfo(id: string): WordStudyInfo | undefined {
  const word = words.get(id);
  if (!word || !usage[word.word]) return undefined;
  return { phonetic: coursePhonetics[word.word] ?? word.phonetic, usage: usage[word.word], contrast: contrasts[word.word] };
}
