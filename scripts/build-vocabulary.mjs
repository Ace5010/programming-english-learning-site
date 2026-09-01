import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toSimplified = OpenCC.Converter({ from: 'hk', to: 'cn' });
const targetCount = 3560;

const coreRows = fs.readFileSync(path.join(root, 'scripts/core-vocabulary.txt'), 'utf8')
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((row) => {
    const [word, meaning, category, example, exampleZh, phonetic = ''] = row.split('|');
    return { word, meaning, category, example, exampleZh, phonetic, tier: '核心' };
  });

function categoryFor(term) {
  const t = term.toLowerCase();
  const rules = [
    ['GitHub 与版本控制', /git|repository|version control|branch|commit|merge|source code|code review|release/],
    ['安全与权限', /security|secure|auth|password|virus|malware|attack|encrypt|firewall|privacy|threat|certificate|access control/],
    ['测试与调试', /test|debug|error|fault|exception|diagnostic|quality assurance|bug|trace|log /],
    ['数据、算法与 AI', /data|algorithm|artificial intelligence|machine learning|neural|model|analytics|knowledge|robot|computer vision/],
    ['网络与云服务', /network|internet|web |cloud|server|protocol|domain|router|gateway|wireless|broadband|packet|hosting|stream/],
    ['后端与数据库', /database|query|sql|backend|service|api|transaction|record|schema|microservice|middleware/],
    ['前端开发', /browser|html|css|javascript|user interface|display|graphic|layout|responsive|website|webpage|screen/],
    ['操作系统与文件', /file|folder|directory|disk|memory|operating system|device|hardware|storage|processor|keyboard|mouse|driver/],
    ['命令行与开发工具', /software|application|program|compile|development|tool|command|terminal|install|configuration|runtime|platform/],
  ];
  return rules.find(([, regex]) => regex.test(t))?.[0] ?? 'IT 通用术语';
}

function technicalExample(term, index) {
  const templates = [
    ['The documentation explains ' + term + '.', '文档解释了“' + term + '”。'],
    ['This project uses ' + term + '.', '这个项目使用了“' + term + '”。'],
    ['Check the settings for ' + term + '.', '检查“' + term + '”的设置。'],
    ['The team is testing ' + term + '.', '团队正在测试“' + term + '”。'],
  ];
  return templates[index % templates.length];
}

const glossaryText = fs.readFileSync(path.join(root, 'sources/it-glossary/IT_Glossary.txt'), 'utf8');
const technical = [];
const linePattern = /^\s{5,}([A-Za-z0-9@][A-Za-z0-9@()\[\]/.,'&+\- ]*?)\s{2,}([\u3400-\u9fff\[（【].*)$/;
for (const line of glossaryText.split(/\r?\n/)) {
  const match = line.match(linePattern);
  if (!match) continue;
  const word = match[1].replace(/\s+/g, ' ').trim();
  const meaning = toSimplified(match[2].trim()).replace(/\s+/g, ' ');
  if (word.length < 2 || word.length > 65 || /^(November|Information Technology Terms)$/i.test(word)) continue;
  const [example, exampleZh] = technicalExample(word, technical.length);
  technical.push({ word, meaning, category: categoryFor(word), example, exampleZh, phonetic: '', tier: '专业' });
}

const basic = [];
const beginnerPaths = [
  path.join(root, 'sources/beginner-english/初中.jsonl'),
  path.join(root, 'sources/beginner-english/高中.jsonl'),
];
for (const line of beginnerPaths.flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/))) {
  if (!line.trim()) continue;
  const item = JSON.parse(line);
  const word = String(item.word ?? '').trim();
  if (!/^[A-Za-z][A-Za-z '-]*$/.test(word) || word.length > 30) continue;
  const firstMeaning = item.translations?.[0];
  if (!firstMeaning?.translation) continue;
  const sentence = item.sentences?.find((entry) => entry.sentence && entry.translation);
  const example = sentence?.sentence ?? 'You may see the word “' + word + '” in technical documentation.';
  const exampleZh = sentence?.translation ?? '你可能会在技术文档中看到“' + word + '”这个词。';
  const category = categoryFor(word);
  basic.push({
    word,
    meaning: String(firstMeaning.translation).trim(),
    category: category === 'IT 通用术语' ? '文档基础英语' : category,
    example,
    exampleZh,
    phonetic: item.us ? String(item.us).replace(/^\/+|\/+$/g, '') : '',
    tier: '基础',
  });
}

const seen = new Set();
const vocabulary = [];
for (const item of [...coreRows, ...technical, ...basic]) {
  const key = item.word.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  vocabulary.push({ id: vocabulary.length + 1, ...item });
  if (vocabulary.length === targetCount) break;
}

if (vocabulary.length !== targetCount) {
  throw new Error('Expected ' + targetCount + ' terms, generated ' + vocabulary.length);
}

const output = '// @ts-nocheck -- generated vocabulary dataset\n' +
  'export type VocabularyItem = {\n' +
  "  id: number; word: string; meaning: string; category: string; example: string; exampleZh: string; phonetic: string; tier: '核心' | '专业' | '基础';\n" +
  '};\n\nexport const vocabulary: VocabularyItem[] = ' + JSON.stringify(vocabulary) + ';\n';
fs.writeFileSync(path.join(root, 'src/vocabulary.ts'), output, 'utf8');

const categories = [...new Set(vocabulary.map((item) => item.category))].sort();
const counts = Object.fromEntries(categories.map((category) => [category, vocabulary.filter((item) => item.category === category).length]));
console.log(JSON.stringify({ total: vocabulary.length, core: coreRows.length, extractedTechnical: technical.length, availableBasic: basic.length, categories: counts }, null, 2));
