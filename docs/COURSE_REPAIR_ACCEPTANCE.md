# 二次修复与验收记录

> 本文为 2026-10-01 的历史记录。2026-10-03 的后续修复、最终构建和剩余验收边界见 [当前收尾记录](COURSE_CLOSEOUT.md)。

执行日期：2026-10-01（21:15–22:25，GMT+8）
基线：**接手时的工作区**（HEAD `049f28e5e1ec33f0b43d070ec4f20d04e09b53a0` + 未提交改动），
快照存于 `artifacts/course-repair-2/baseline/`。基线并非 Git HEAD：本轮开始时工作区已有
上一 agent 的未提交改动（`src/programmingSupport.ts`、`src/adaptiveLearning.ts` 等 10 个文件），
所有对比都以那份快照为准。

本轮**未提交、未推送、未发布**。

---

## 一、修复学习推进与去重的冲突

**实际原因（两个独立原因叠加，均已复现）**

1. `pickNext` 新增的硬过滤 `item.ids.some(id => focus.has(id))` 把「本轮重点词」当成了硬门槛。
   而 `previewAdaptiveScope` 按 confidence **升序**取重点词，像「confidence 已 1.00、但 transfer
   尚未达成」的词一旦被挤出重点名单，它的题目就**完全不可达**，永久无法准入。
2. `authoredMetadata` 把无句子的单词题 `learningContext` 从 `phrase:<knowledgeIds>` 改成了
   `word:<id>`，与 `practiceForWord` 生成的 meaning/word/listen/match 变体**共用同一个去重身份**，
   答对其一便在本轮顶掉其余同类题，每轮实际曝光面变窄、证据积累过慢。

**修改文件与函数**

- `src/adaptiveLearning.ts` → `pickNext`
  - 删除硬过滤 `item.ids.some(id => focus.has(id))`，焦点恢复为「偏好」而非门槛（原有权重
    `focused ? 3 : 0.4` 保留）。
  - 删除全局硬过滤 `fresh`（只优先未答对的变体）；`weight` 中原有的 `signatures × 0.45`
    仍然生效，所以「优先未见过的变体」这一意图保留，但不再把唯一能产生准入证据的变体永久排除。
  - 保留本轮去重 `successful`（按 目标＋能力＋语境），本轮同题不重复仍然成立。
- `src/programmingPractice.ts` → `authoredMetadata`：`learningContext` 恢复为
  `sentence:` / `phrase:<knowledgeIds>`，不再与生成题共用去重身份。

**测试**

| 测试 | 修复前 | 修复后 |
| --- | --- | --- |
| `test-adaptive-admission.mjs`（完整编程课程 + 准入 + 存储回放） | **失败**：`correct real-content practice must eventually finish the teaching scope`（180 轮上限耗尽，`word-75` / `word-21` 永久卡住） | **4/4 通过**：126 轮、1429 次作答、935 道不同题，准入 5–38 题/词 |
| `test-course-question-scope.mjs` | 通过 | 通过（本轮去重仍生效） |

二分证据（每个变体都在独立沙箱里跑同一脚本，未回退工作区）：

| 组合 | 结果 |
| --- | --- |
| Git HEAD 原样 | 通过（153 轮 / 1597 答 / 969 题） |
| HEAD + 本轮去重 | 通过（125 轮） |
| HEAD + 去重 + 焦点硬过滤 | **失败**（未跑完） |
| HEAD + 去重 + learningContext 改动 | **失败**（未跑完） |
| 两者回退（= 本轮修复） | **通过**（126 轮） |

**二次核查确认**：不是靠「删掉某条过滤条件」了事——两个条件分别被单独证明会导致不收敛，
删掉后以**实际推进结果**（轮次、作答数、63/63 准入）为准复验。

---

## 二、修正辅助释义并补齐范围核查

**实际原因**

1. `down` 用通用释义「向下」解释了 `The server is down.`，语境义应是「无法正常运行／停机」；
   `set up` 被拆成「设置＋向上」，`There is…` 被解释成地点。
2. `supportWords` 是从**补全后的整句**（含被考答案、含听力录音全文）推导的：听力题会把录
   音里大部分词提前列出来；`P1-02-04-e05`（答案 `name`）、`P1-02-06-e05`（答案 `count`）
   的释义区直接给出了被考答案。

**修改文件与函数**：`src/programmingSupport.ts` → `programmingExerciseSupport`

- 新增句子级语境表 `contextualMeanings`（只覆盖三句原文，**不做全局替换**）。
- 词条来源改为「学习者已可见的文本」（题面＋选项＋空格周围片段），
  语境判定仍读完整句子（含 `explanation`，它只在作答后显示），因此填空 / 排序 / 听力变体
  也能取到正确语境义，而听力题不再提前列出录音内容。
- 单字答案一律不进释义区（整句答案不受影响，避免误伤翻译题）。

**有限范围核查（编程课程 + 生成候选题，共 1271 题）**

- 缺失释义：全库「既非核心词、也无释义」的 token 只剩 `b`（`function add(a, b)` 里的变量名，
  代码标识符，不需要释义）。
- 明显多义 / 短语拆解失真：修正 `down`、`up`、`there`；`found` 改为
  「找到（find 的过去式／过去分词）」。
- 答案泄露：修复前 2 处（`name`、`count`），修复后 **0 处**。

**测试**（`tools/test-course-question-scope.mjs`，断言取自实际题面 + 人工确认的预期含义）

| 用例 | 修复前 | 修复后 |
| --- | --- | --- |
| `"The server is down." explains down as unavailable, never as a direction…` | 失败 | 通过 |
| `other context-only meanings stay scoped to their own sentence` | 失败 | 通过 |
| `no supporting gloss anywhere reveals the answer that question is asking for` | 失败（`P1-02-04-e05 glosses its own answer: name`） | 通过（1271 题、全部释义） |
| `a choice question whose answer is a visible English word does not explain that word` | 失败 | 通过 |

英文原文未改动，因此**未重新生成音频**；`npm run build` / `npm run verify` 的音频清单与
文本哈希全部通过，与既有基线一致。

---

## 三、旧版未完成课程正确续接

**实际原因**：新的范围规则只作用于「抽下一题」，没有覆盖**更新前已保存的当前题**。
本地载入、刷新、跨标签页与同步记录都走 `loadProgress`，但那里只做结构解析，不检查范围，
于是老记录里的超范围题会被照原样呈现。

**修改文件与函数**

- `src/dailyProgress.ts`：`DailySession` 新增可选字段 `replaced`（原题 + 原草稿 + 时间），
  `validSession` 同步校验；旧记录缺该字段仍然合法。
- `src/adaptiveLearning.ts` → 新增 `reconcileSavedQuestion`
  - 只处理「当前题、未作答、无反馈」，且只换一次。
  - 原题与用户已填内容存入 `replaced`（可恢复），新题用 `createDailyDraft` 重新开始，
    **不继承**旧答案；不写任何 answer / help / error 证据；不动 `learning`、`lessons`、`knowledge`。
  - 再跑一次是空操作（幂等），刷新、重复载入、同步载入都不会反复换题或重复计分。
  - 没有合法替代题时返回课程页（`session: null`）并保留全部记录——不写入无法再次解析的空会话。
- `src/DailyEnglish.tsx` → `loadProgress` 统一调用上述函数；练习区按 `session.replaced`
  显示一句简短说明。

**测试**（`tools/test-course-upgrade-sync.mjs`，使用「更新前代码产生的旧版进度样本」形状）

| 用例 | 结果 |
| --- | --- |
| `a question saved before the scope rule is set aside once, keeping its draft and evidence` | 通过 |
| `a saved question that is still inside the taught scope is restored untouched` | 通过 |
| `a question that is already answered keeps its feedback and is never reshuffled` | 通过 |
| `a reconciled record survives two-client synchronization unchanged` | 通过 |
| `an out-of-scope question with no legal replacement returns to the course page without a broken session` | 通过 |

---

## 四、连线题的混合结果与最后一对

**实际结论**：`pairPractice` 的最后一对与 `adaptiveLearning` 的按目标记录已经正确，
**保留实现、补充测试**：

- 最后一对必须由用户亲手点击才完成；完成前不进入反馈、刷新后仍待操作；完成后记为
  `unmeasured`，不加独立回忆证据。
- 混合结果按目标分别记录：独立答对的目标获得证据，借助帮助/被揭示的目标准确降分，
  最后一对**不加不减**——A 的正确不会覆盖 B 的困难，C 也不会被虚增能力。
- 去重只排除「A 所属的那一组」，B、C 仍有自己的单目标候选题可练。

**测试**（`tools/test-course-upgrade.mjs`，日常 × 编程 × 文字/音频 共 4 条）

| 用例 | 修复前（基线 `pairPractice`） | 修复后 |
| --- | --- | --- |
| `programming text/audio pairs: mixed results keep the assisted and final targets practising` | **失败**：`the final pair must still be outstanding`（3 对时自动补完） | 通过 |
| `daily text/audio pairs: …` | 通过 | 通过 |

---

## 五、执行的验证汇总

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | 通过 |
| `node --test test-course-question-scope test-course-upgrade test-adaptive-admission test-course-upgrade-sync` | 0 | **55/55** |
| `node --test`（course-loop / programming-content / programming-progress / daily-content / daily-progress / word-learning / adaptive-learning / daily-practice / programming-practice / programming-review / 上述四者） | 0 | **130/130** |
| `node tools/test-course-upgrade-browser.mjs`（5186） | 0 | **17/17** |
| `node tools/test-mobile-browser.mjs`（5186） | 0 | **13/13** |
| `node tools/test-adaptive-course-browser.mjs`（5186） | 1 | **未通过：3/15**（见「未验证事项」） |
| `npm run build` | 0 | 通过：15,996 文件、双声线完整、各音频清单校验通过 |
| `npm run verify` | 0 | 通过：词汇 3,620、Aria/Guy 各 7,241、Piper 7,122、缺失 0、损坏 0 |
| 三组固定种子完整课程推进 `artifacts/course-repair-2/three-seed-course.mjs` | 0 | 全部完成准入 |

**三组固定种子的完整编程课程推进**（真实作答 + 存储保存/恢复链路，非直接改状态）

| 种子 | 生成轮次 | 作答数 | 不同题目 | 已教学目标 | 准入 |
| --- | --- | --- | --- | --- | --- |
| 371 | 153 | 1,635 | 983 | 63 | **63/63** |
| 613 | 138 | 1,493 | 955 | 63 | **63/63** |
| 887 | 134 | 1,406 | 910 | 63 | **63/63** |

浏览器检查全部使用隔离的 Chrome context 与测试数据，未写入真实学习记录、未使用真实同步码、
未向任何同步空间上传测试数据；未改端口（开发端口仍为 5186）。

**产物位置**

- 代码基线快照与 SHA256：`artifacts/course-repair-2/baseline/`
- 诊断脚本与日志：`artifacts/course-repair-2/diag-*.mjs`、`three-seed-course.{mjs,log}`
- 浏览器截图与结果：`artifacts/course-repair-2/browser/`、`artifacts/course-repair-2/browser-rerun/`
- 自适应浏览器失败证据：`artifacts/course-repair-2/adaptive-browser-evidence/`

**关键文件 SHA256（前 16 位，对应本记录的最终源码）**

| 文件 | SHA256 |
| --- | --- |
| `src/adaptiveLearning.ts` | `c626c8549771607f` |
| `src/programmingSupport.ts` | `c8fba9a2842558b5` |
| `src/programmingPractice.ts` | `47575fa92c49b15b` |
| `src/dailyProgress.ts` | `74c2a8a5bb295a54` |
| `src/DailyEnglish.tsx` | `daab79ffaf1e09fc` |
| `src/pairPractice.ts` | `d738d76fff0a7817` |
| `src/CoursePairs.tsx` | `15f1c5cd28aa0c26` |
| `src/coursePractice.css` | `2781b043f0a34c31` |
| `tools/test-course-question-scope.mjs` | `f815c9f16fb74fb2` |
| `tools/test-course-upgrade.mjs` | `ec2f71ee048eb450` |
| `tools/test-course-upgrade-sync.mjs` | `a39cce446516b7e8` |
| `tools/test-course-upgrade-browser.mjs` | `7d4e47d7dfb3bfe8` |
| `tools/test-mobile-browser.mjs` | `183aaa092ab02396` |
| `tools/test-adaptive-course-browser.mjs` | `5d2cb6c8843e1d27` |

---

## 六、历史未验证事项（2026-10-01 的状态）

1. **当时 `tools/test-adaptive-course-browser.mjs` 未通过（3 通过 / 12 失败）。**
   留存报告位于 `artifacts/course-repair-2/adaptive-browser-evidence/browser-results-after-fix.json`。
   页面定位与预期仍沿用旧流程：标题断言只接受“第 N 节”，当前标题还带主题；
   编程当前课程卡的第一个按钮可能是点读，而不是开始学习。
   当时脚本已使用新配色名称；原记录把配色名称也归为最终未修正项的说法不准确。
   此处保留失败结果作为历史证据，后续修复与复验见当前收尾记录。
2. **`tools/test-mobile-browser.mjs` 依赖上述脚本产出的 `artifacts/adaptive-course/earned-fixtures.json`。**
   该文件在版本控制中，本轮已还原到提交状态，窄屏测试因此可以运行并通过 13/13；
   但若在自适应脚本失败的机器上重跑，它会再次被覆盖为空夹具。这是两个脚本的既有耦合。
   顺带说明：本轮修复过程中曾误覆盖 `artifacts/adaptive-course/` 下的受控文件，均已
   `git checkout` 还原，该目录当前与提交状态一致（改动 0）。
3. **安卓真机未验证**（本轮无需扩展）。窄屏与键盘高度检查是浏览器仿真，**不等于真机验证**。
4. 同步路径只在 Node 侧用「双客户端 + 内存服务」验证（`test-course-upgrade-sync.mjs`），
   未连真实 D1 或真实同步码。
5. 未做人工逐题复读全部 131 个辅助释义词：多义判断基于「在哪些句子中出现 + 人工确认预期含义」
   的清单（见第二节），`a` 在 `function add(a, b)` 这类代码片段里仍会显示成冠词义，
   属释义表按 token 匹配的固有限制，未改（需上下文判别，超出本轮范围）。
6. 学习效果类结论（是否更好记住词）仍需真实使用数据，本轮不涉及。
