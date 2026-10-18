# 口语识别接入

2026-10-04 课程调整：编程普通新课已改为约 6 个全新词的自主点读学习与 10 题词义／语境检验，不安排强制跟读核对、不评判发音，也不等待识别服务。日常英语及历史口语记录、候选和原识别接入继续保留。旧编程待答口语题可替换为本节检验题，原草稿与识别文字仍保存在会话；下一节不混入旧词。当前规则见 [编程课程](PROGRAMMING_ENGLISH.md)，下方“开口优先”分布和验收属于此前阶段，不能代表当前编程新课。

2026-10-04 识别接入配置：按用户此前授权，仍提供跟读的页面默认使用本机 **Qwen3-ASR-1.7B**，启动器及接入已切换。录音不保存、不调用云端，处理上限 30 秒；浏览器／安卓的原识别路径保留。真实公开音频的课程回填、刷新恢复和异常回归已通过，用户实际麦克风效果仍待使用验证。模型选择与验证详见 [跟读模型替换](ASR_REPLACEMENT.md)。下文保留各阶段历史接入和验收。

2026-09-15。现有日常课程中的 12 道口语题增加真实麦克风识别入口，原有自由表达自查保留。没有新增依赖、后台、账号、密钥或录音文件；本地端口仍是 5186。

## 使用

1. 选择“跟读示例”，点“听示范”或“慢速”。
2. 点“点击开始说”，允许浏览器使用麦克风，然后朗读对应句子。界面收到真实收音事件后才显示“正在听”。
3. 识别完整时自动结束；也可点“读完了”。对齐结果显示已识别、未识别到、被识别成其他词及多识别到的词，点击“再读一次”重试。
4. 全部参考句通过核对后点“完成跟读”。结果、已完成句子和最终识别文字随学习进度保存。
5. 说自己的姓名、来源或自由回答时切换“自己表达”。此处把声音转为可编辑文字，保留原题自查项，不把与示例不同的姓名当成错误。

跟读只比较识别文字，不提供音素、口音、语调或发音质量分数。大小写、标点、常见缩写及 0–100 的数字写法归一化；词序、漏词、多词和替换仍影响匹配。空结果和临时结果不会通过，也不会计入答错。

## 浏览器与数据

- 使用 `SpeechRecognition` / `webkitSpeechRecognition`。检测到已安装的本地英语识别时优先使用；不自动下载语言包。否则由浏览器语音服务识别，声音可能发往该服务，按钮前有说明。本站不保存录音。
- 需要 HTTPS 或 localhost 安全环境、受支持的浏览器和麦克风权限。权限拒绝、无设备、无声音、网络服务失败和启动超时均有提示，不虚构识别结果。
- 仅主动点击开始监听；离开题目、分区、隐藏页面或切换表达方式会取消监听，取消后的晚到事件不保存。主题切换保留正在进行的识别。收音最多 40 秒，停顿后自动收尾，也可手动结束。
- `codewords-daily-v1` 仍为版本 1，草稿仅增加可选 `speech: { mode: 'read' | 'self', transcripts: { [phraseId]: string } }`。旧记录和旧自查反馈兼容；原有编程英语键、课程规则和音频文件未修改。
- 跟读仍记录为 `self` 类口语练习，不把识别文字匹配当作独立掌握或隔日记忆证据。

## 验证与边界

- 类型检查与 97 项纯函数测试通过，其中新增 15 项逐词对齐测试、5 项口语状态与旧记录兼容测试。
- `tools/test-daily-speech-browser.mjs`：9 组模拟识别事件测试通过，覆盖临时/最终结果、错词重读、权限/网络/静音/无设备、取消后的晚到事件、手动停止后到达的最终结果、切换主题与分区、旧标签页保护、启动超时和不支持浏览器的替代入口。**这些异常是可控模拟，不能当作真实服务识别证据。**
- `tools/test-daily-speech-native.mjs`：隔离 Chrome 152 调用真实识别服务，以已有课程 MP3 的合成音轨输入，未模拟结果事件。第一课 Hello → 刷新 → Goodbye → 跟读完成 → 本课完成通过；长句和不同姓名的自由表达转写、编辑与刷新通过。四种主题 × 1440 / 1920 / 390px 无横向溢出。
- 原有日常英语 10 组浏览器回归通过，覆盖 24 课 / 120 道主练习、纠错、自查路径、多空键盘、双声线与速度、刷新恢复、损坏数据和原有编程记录保护。
- `npm run build`、`npm run verify` 通过：3,560 词、原有 Aria / Guy 各 7,121 个 MP3、日常音频 166 个均完整。静态成品的嵌套路径、两区真实点读和刷新恢复通过生产页面检查。构建保留既有单包超过 500 KB 的提示。
- 没有使用用户的真实麦克风，因此用户设备的收音质量和真人发音识别准确率尚未实测；没有下载或验证本地识别语言包。

运行脚本时，`CODEWORDS_TEST_URL` 指向现有服务，`CODEWORDS_PLAYWRIGHT` 指向已经安装的 Playwright。真实服务测试使用合成音轨，不打开物理麦克风；相关 helper 为 `tools/helpers/native-speech-input.mjs`。

证据： [真实语音 UI 结果](../artifacts/daily-speech/native-ui-results.json)、[异常模拟结果](../artifacts/daily-speech/simulated-browser-results.json)。截图： [简约桌面](../artifacts/daily-speech/read-minimal-1440.png)、[手绘](../artifacts/daily-speech/read-sketch-1440.png)、[涂鸦](../artifacts/daily-speech/read-graffiti-1440.png)、[手机](../artifacts/daily-speech/read-minimal-390.png)。

API 行为依据：[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)、[设备内识别](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)。

## 2026-10-04 跟读容错与三次保护

此更新适用于日常和编程课程共用的跟读核对。当前真实页面中 `Please check my pull request.` 的保存结果为 `please check my poll request`；原逻辑要求全部逐词匹配，因此仅 `pull` 一词的误识别也会卡住。

- 三词及以上的句子，只漏、替换或多识别一个词，并且至少两个目标词匹配，即可通过。多处近音差异按下方的扩大语境规则核对；多处无法解释的差异仍须重试。单个词保留完整核对，两词及以上可使用有上下文依据的近音容错。
- 原始识别文字不改写，逐词对齐仍保留真实差异；通过后不再用红色错误样式要求重读。结果区区分完整匹配、上下文容错和单词容错。
- 每句最多三次有效最终识别。第三次仍不通过，保存 `correct: false`、`speech.source: skipped`、`speech.assessment: failed`，停留在当前题并显示“这题先跳过”的底部确认。由用户点“继续”进入下一题；若已到课末则进入结果页。第三次通过则照常由用户点“完成跟读”。权限、网络、无声音、空结果、临时结果和手动编辑均不消耗机会。
- 草稿增加可选的 `speech.attempts`，答案增加可选的 `speech.assessment` 与 `speech.attempts`。刷新、听示范、显示文本、编辑和切换表达方式保留次数；刷新后仍显示待确认的跳过提示，不自动换题。晚到回调不能覆盖确认状态或下一题。旧草稿、旧答案、原键名及版本 1 保持兼容。
- 容错通过仍只完成口语活动，不增加独立掌握或长期复习准入；三次未通过不登记为开口成功，也不把识别错误当作阅读、拼写或真人发音能力不足。手动跳过与三次未通过在记录中可区分。

针对性检查：`tools/test-speech-comparison.mjs`、`tools/test-daily-speech-state.mjs`、`tools/test-course-upgrade-sync.mjs` 和 `tools/test-speech-protection-browser.mjs`。浏览器测试覆盖两区的一词通过、三次失败后确认、第三次成功、服务错误与空结果、刷新恢复、模式切换、手改来源、晚到回调和手机布局；识别事件明确为模拟，另一区和旧记录保持不变。隔离双客户端验证新增字段同步；不代表真实 D1 或真人麦克风验证。

这里改善的是识别结果的上下文核对和课程放行，没有修改 SenseVoice 模型或宣称其真人识别准确率提高。本站没有保存历史录音，无法回听先前的发音。

首次修订验收（当时为三次后直接换题）：[检查汇总](../artifacts/speech-protection/verification.json)、[开发页场景](../artifacts/speech-protection/browser/report.json)、[生产成品场景](../artifacts/speech-protection/production/report.json)。188 项 Node 回归、类型检查、构建、资源完整性、两页各 8 个定向浏览器场景、9 个识别生命周期场景、13 个移动场景、9 个重点词浏览器场景及本地录音适配器模拟检查通过。

### 跳过确认修订

按用户后续反馈取消静默换题。达到三次上限时，页面底部以中性色显示“这题先跳过”，说明尝试次数、本题未通过及“继续”按钮的用途。主动跳过也使用相同位置的确认。当前题和识别文字保留，麦克风停止并禁用；点击继续才推进，刷新不能略过确认。提示不使用答对勾号、答错红色面板或“这个难点已记录”的泛化文案。

语音链路核查：`tools/benchmark_sensevoice.py` 已指定英语，使用 greedy CTC 解码，`tools/sensevoice_recognition.py` 对整段录音转写，未向模型发送参考答案。此次没有调整模型、解码或录音预处理。上一轮“优化”准确范围仅为识别结果核对与容错；原生识别准确率仍未验证改善。SenseVoice CTC 不属于 sherpa-onnx 原生热词功能所支持的 transducer 解码路径，不能直接宣称已接入该功能。依据：[官方热词限制](https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html)。

确认流程验收：[汇总](../artifacts/speech-confirmation/verification.json)、[开发页](../artifacts/speech-confirmation/browser-final/report.json)、[生产成品](../artifacts/speech-confirmation/production/report.json)。88 项相关 Node 回归、类型检查、构建、开发与生产各 10 个定向场景、13 个手机布局场景及 9 个识别生命周期场景通过。截图中的识别事件来自隔离测试，不是用户真人发音。

### 语境容错扩大

按用户继续反馈，取消近音容错只能有一处差异的限制。第二遍核对按目标句的顺序对齐识别词，用轻量的英文拼写近音规则、常见同音写法及词尾差异解释转写；同时处理识别器拆词或连词，例如 `re quest`、`read me`、`poolrequest`。这是本地转写判定规则，不是音素分析、语义模型或发音评分。

普通句子通常需要至少半句有序文字匹配，其他部分全部有近音或词边界依据；不会补齐识别结果缺失的内容，或丢弃无关额外词。目标句含已知术语 `pull request` 时扩大窗口，整句仍须至少两个真实匹配词。例如 `please cheque my pool requests` 的三处差异、`please check my pool re quest` 的近音与拆词差异均可完成跟读。仅朗读术语 `pull request` 时，也容忍 `pool requests`、`Paul request` 与连写；单词 `pull` 单独被转写为 `poll` 仍不通过。

同一规则也覆盖其他句子，如 `Read the code for me.` → `reed the coat for me`。明显不相近的多处替换、重排目标词、过多漏词及没有足够语境的多处近音差异仍需重试。原有单词任意差异容忍独立保留，不与多处近音容错叠加来进一步忽略无法解释的词。

原始转写、来源和次数不改写，第三次得到可接受的语境结果照常通过；第三次仍失败保持跳过确认。没有修改 SenseVoice 声学模型、解码或收音处理，因此本次不能作为真人原始转写准确率提高的证据。

本轮检查和隔离页面结果保存在 `artifacts/speech-context/`，识别输入明确为模拟最终结果。测试覆盖多处近音、拆词连词、第三次语境通过、刷新后保留原文字、独立能力不增加，以及既有失败确认和异常生命周期。

验收：[汇总](../artifacts/speech-context/verification.json)、[开发页](../artifacts/speech-context/browser/report.json)、[构建成品](../artifacts/speech-context/production/report.json)。92 项相关 Node 检查、类型检查、构建与资源完整性、开发与生产各 13 个定向场景、13 个手机布局场景及 9 个识别生命周期场景通过。没有使用用户麦克风、历史录音或真实同步服务。


## 2026-10-03 普通课程口语优先收尾

上文为 2026-09-15 的历史接入与验证。此次在原目录 `main` 接续已有改动，只调整日常与编程普通课程；未提交、推送或发布。英语基础、账户、D1 架构、开放式 AI 与发音评分均未扩展。旧录音全部复用，新增或改写英文录音为 0。

### 两区的实际变化

- `COURSE_ACTIVITY_MIX` 集中设置日常开口／理解／输入为 60%／25%／15%，编程为 50%／35%／15%。先根据累计活动缺额选类别，再按合法目标、重点、弱项、间隔及去重抽题，候选数量不能稀释类别配比。填空、听写填空、补字母、整句书写统一计作输入，普通课程最多连续两项；类别不足时选其他合法活动，确无替代候选则有限收尾。专项重点词练习及能力复习保留原编排。
- 日常各教学范围增加完整跟读、部分提示复述及已有问句对应的短回答。姓名、来源沿用自查，可以换成自己的内容。综合对话范围复用其中已有录音的一句短表达，不把整段对话塞进一道新题。
- 编程全部 63 个核心目标增加整句跟读、中文提示复述，以及听短说明说出术语的回应候选；保留原阅读目标、理解题与准入标准，口语能力明确映射为 `speaking`。
- 确认教学后首题即可完整跟读，不再有初始信心门槛或每轮一道口语上限。复述需要先实际接触材料。每项新普通口语是一句或一个短回应，占原有限预算；相同材料和支持方式不能靠另一个 ID、目标或作者范围重复。

### 生词跟读与独立考核

正式目标仍由 `adaptive.focusIds` 确认教学。`readAloud` 只标识文本与录音材料，`supportWords` 提供辅助释义与已有逐词点读。完整有示范的跟读不要求材料 ID 或附带词已进入目标记录；复述沿用接触过的材料并允许重听、显示文本。独立短问答与普通客观题仍核查目标、问题材料及必要前置词，没有全局放开 `speak` 或删除范围检查。

定向材料为 **Use checkout to change branches.**（使用 checkout 切换分支）。页面只确认 checkout 为正式目标，change、branches 有中文解释与单词点读；自然整句录音、慢速和麦克风正常。模拟识别完成后可结课，`learning.targets` 和 `knowledge` 仍只有 checkout；未给 change 或 branch 安排作业、标记已会或准入。另有普通题前置词保护对照测试。切换到“自己表达”时，原跟读／复述保持参考支持并记录辅助条件；独立问答展开参考则记辅助。

### 完成与证据

`DailyDraft.speech` 保留可选的 `sources`、`heard`、`revealed`；答案保留可选 `speech`：活动、read/self 方式、full/partial/hidden 支持、recognition/edited/typed/unknown/skipped 来源及是否使用参考。旧草稿和旧答案缺这些字段仍可读，旧识别来源按 unknown 保守处理，页面使用“文字与参考句一致”；切换方式保留已有辅助标记。

口语始终为 self 记录，可以完成活动与本轮预算；它不增加信心、独立正确、拼写、阅读、跨日回忆或发音质量证据。手改识别文字与文字替代分开记录，不声称未经修改的识别成功。真实目标接触更新 `lastSeenTurn`；句中附带的已有目标及实际听过的问题也更新接触间隔，避免制造久未见过的假证据，但不创建未学辅助词记录。`speechMaterials` 仅保存已接触材料，不将辅助词登记为正式目标。跳过单次活动既不记答错，也不计口语完成或已会；结果页将口语／自查活动与跳过区别。

较少的客观活动优先照顾已具备基础信心、仍缺真实间隔或另一语境证据的目标，避免大量熟悉变式挤掉必要检查；原准入门槛保持。识别权限拒绝、空结果和服务失败不提交答案、不增加弱项，可重试、替代输入或跳过。换题使用组件实例边界取消旧识别；播放与收音停止对方，离开分区和页面后忽略旧回调。

### 实际分布与推进证据

六组固定种子 `.01/.19/.37/.51/.79/.99`，每区各 12 轮，共 144 轮真实选题。支持字段与所有目标状态均通过实际提交和推进产生，没有手改掌握或提高原课程完成上限。

| 分区 | 开口活动 | 理解活动 | 输入活动 | 比例（开口／理解／输入） | 最长连续输入 |
| --- | ---: | ---: | ---: | --- | ---: |
| 日常 | 596 | 266 | 144 | 59.2%／26.4%／14.3% | 1 |
| 编程 | 472 | 342 | 141 | 49.4%／35.8%／14.8% | 1 |

这是安排的主要作答活动次数，既不是时间占比，也不是实际开口成功率。纯函数模拟的口语使用自查替代，不冒充真人效果。

生产成品隔离 Chrome 各走两轮：日常为 **7／3／2**、**9／4／2**；编程为 **6／4／2**、**8／6／2**（开口／理解／输入）。两区均出现跟读、复述与回答。日常 14 项使用模拟识别回填、编程 12 项，均含一次编辑识别文字；每区另一次文字替代、一次跳过。报告逐项保留实际来源，模拟回调不当作真实语音服务。刷新、切分区与另一区记录保护通过。

完整实际作答模拟：编程原 180 轮保护内以 **68 轮、929 项活动**完成 63 个目标准入，准入前各目标有 3—8 次客观检查；日常以 **148 轮、2,049 项活动**完成 86 个目标准入。口语活动均未改变信心，准入来自有效的理解／回忆检查，不伪造回合或降低标准。轮次数仅为确定性测试结果，不能承诺真人所需课数。

### 验证结果与证据位置

TypeScript、生产构建和 `npm run verify` 通过；3,620 词、Aria/Guy 各 7,241 MP3、旧 Piper 7,122、日常 172 音频完整，无缺失或零字节。构建仍有原单包超过 500 KB 提示。

相关纯函数检查合计 **181 项**通过，包括完整课程推进、口语字段同步、缺类别候选及已知附带词接触间隔检查。命令：

```powershell
npx tsc --noEmit
node --test tools/test-adaptive-learning.mjs tools/test-adaptive-admission.mjs tools/test-daily-practice.mjs tools/test-programming-practice.mjs tools/test-course-question-scope.mjs tools/test-course-loop.mjs tools/test-daily-content.mjs tools/test-programming-content.mjs tools/test-daily-progress.mjs tools/test-programming-progress.mjs tools/test-programming-review.mjs tools/test-course-upgrade.mjs tools/test-course-upgrade-sync.mjs tools/test-course-skip.mjs tools/test-speech-comparison.mjs tools/test-daily-speech-state.mjs tools/test-word-learning.mjs tools/test-speaking-first.mjs
npm run build
npm run verify
```

已运行浏览器脚本（设置现有 `CODEWORDS_TEST_URL`、`CODEWORDS_PLAYWRIGHT` 及隔离产物目录）：

- `test-adaptive-course-browser.mjs`：20 场景、191 次客观回答、230 次口语自查，覆盖新手、困难回流、有限轮次、准入、旧会话、恢复、损坏数据和四配色／桌面手机。
- `test-speaking-first-browser.mjs`：开发页及 `/dist/` 生产成品的两区各两轮；生产另有未学辅助词定向跟读。
- `test-course-upgrade-browser.mjs` 17 场景；`test-mobile-browser.mjs` 13 场景；`test-course-skip-browser.mjs` 19 场景；`test-word-learning-browser.mjs` 9 场景。
- `test-daily-speech-browser.mjs`：九组识别异常和生命周期模拟检查。
- `test-daily-speech-native.mjs`：Chrome 154 调用真实识别服务，已有 MP3 经 Web Audio 输入语音轨；Hello、Goodbye、长句及不同姓名自我表达均通过，未模拟识别结果。使用示范音轨，不是用户真人麦克风；没有自动下载识别包。

产物统一放在 `artifacts/speaking-first/`：[多种子分布](../artifacts/speaking-first/selection.json)、[生产流程与生词跟读](../artifacts/speaking-first/production/report.json)、[最终自适应浏览器结果](../artifacts/speaking-first/adaptive-browser-final/browser-results.json)、[日常完整推进](../artifacts/speaking-first/daily-complete.json)、[真实识别服务抽查](../artifacts/speaking-first/native-speech/native-ui-results.json)。命令输出与验收索引见同目录 `verification.json` 和 `logs/`。

有限未验证项：真人麦克风、真人学习效果与专业发音质量；此次未重新进行全套 Android 真机、上线发布或真实 D1 验收。新增口语字段已通过隔离双端同步与损坏记录保护，不能把模拟同步称为真实 D1 验证。
