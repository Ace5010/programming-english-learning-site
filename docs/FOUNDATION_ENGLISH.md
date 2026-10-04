# 英语基础教程

## 当前实现：2026-10-03 四组补充

依据《英语基础分区补充与完善方案》在当前 `main` 工作目录实施。以下为实际页面内容；下方 2026-09-27 内容是早期实现记录，不是当前扩写数量。

保留「基础概念与语法」「音标与发音」两个一级入口。发音首页仍是完整传统英式 44 音表，新增教程位于其下方的「进一步学习」。原 56 个可见主题与两篇样章继续可访问；本轮扩写 10 个等价主题，新增 11 个主题，形成 21 篇覆盖 A/B/C/D 的完整讲解，当前目录共 68 篇（包括独立名词角色样章）。每篇有具体疑问、中文解释、少量例词／例句、误用边界、可跳过互动及相关教程。词形与简单构词 E 组仅保留后续计划，本轮没有实施。

| 批次／目标 | 实际页面 ID | 处理与教学内容 |
| --- | --- | --- |
| A1 动作句 | `foundation-word-order` | 扩写：从 I read. 到 I read a book.，区分谁、动作、整个对象词组，保留原喝水与读书例句 |
| A2 be 句 | `foundation-be` | 扩写：动作／状态／身份对照，解释表语，保留 am/is/are 对应 |
| A3 短句扩展 | `foundation-sentence-expand` | 新增：逐步加入对象、在家、每天晚上，五组完整拆解与整句点读 |
| A4 修饰与完整词组 | `foundation-position` | 扩写：保留前置颜色／后置位置，对照 The girl in the room likes this book. 与短句核心 |
| B0 音标入口 | `foundation-letter-sound` | 扩写：区分拼写、字母名称、音标和词中声音 |
| B1 声音合成 | `foundation-blending` | 新增：map／ship 的单音分解、减少停顿与连续整词对照，固定英式 |
| B2 字母组合 | `foundation-letter-combinations` | 新增：sh/ch/th，ship/chip、thin/this，同口音词对及例外边界 |
| B3 词尾 e | `foundation-final-e` | 新增：pin/pine、kit/kite，have 反例；有中文、音标、完整词音频 |
| B4 对应规律 | `foundation-spelling-correspondence` | 新增：see/sea、book/food，不把音质区别简化成拖长 |
| B5 查证读音 | `foundation-dictionary` | 扩写：试读→音标→录音→修正→连回整词；保留原词性与语境查阅，通过互链衔接拼读 |
| C1 方式副词 | `foundation-manner-adverbs` | 新增：He speaks slowly. 与 slow bus 对照，解释描述动作／描述事物 |
| C2 频率副词 | `foundation-frequency-adverbs` | 新增：always/usually/often/sometimes/never，主要动作前／be 后，承认 sometimes 的多个自然位置 |
| C3 并列与选择 | `foundation-and-or` | 新增：词组到完整句，菜单场景中的 and/or，不绝对化二选一 |
| C4 转折 | `foundation-but` | 新增：累了但还能工作，先分别读懂两部分，再看预期改变 |
| C5 因果 | `foundation-cause-result` | 新增：because 后接原因、so 引出本例结果，两句相同信息的重新组织 |
| D1 音节／词重音 | `foundation-syllables` | 扩写：teacher/about 的声音分组、重音标记与完整词录音 |
| D2 句子重点 | `foundation-sentence-stress` | 新增：相同 I want tea. 在“谁”和“什么”两种语境下的声音对比 |
| D3 弱读 | `foundation-weak` | 扩写：I can swim.、a cup of tea，自然语流／独立单词实际对照，不把弱读等同删除 |
| D4 连读 | `foundation-linking` | 扩写：Pick it up.、Turn it on. 的自然整句／逐词对照，标记不改变拼写 |
| D5 停顿／语调 | `foundation-intonation` | 扩写：自然问答，以及连续回答／Yes 后明确停顿的同声线对比 |
| D6 词尾 | `foundation-endings` | 扩写：cats/dogs/buses、walked/played/wanted，前一声音、清浊与多出音节的联系 |

### 内容、声音与兼容落点

`src/foundationTutorials.ts` 保存正文、分块、示范引用和可选互动。`foundationSamples.ts` 将其纳入基础专用音频流程；`foundationCourse.ts` 仅导出独立的 `foundationTutorialCatalog` 合并同 ID 页面，没有改变原 `foundationTopics`、`foundationLessons`、题目、前置关系或历史会话。新例句使用独立稳定 ID，不进入旧题池。`FoundationEnglish.tsx` 复用现有文章呈现、目录、上下篇与互链；新教程不调用自适应编排，不读写学习证据。

基础专用双声线从 298 个文本／596 个 MP3 增至 **352 个不同文本、354 个录音版本／708 个 MP3**，本轮补充 54 个文本、2 个历史文本的教程专用版本，共 112 个录音。原 596 段录音和清单记录逐项保持不变；生成器按文本与哈希增量处理，4 个新录音复用了其他目录中完全相同的对应声线文件。新教程专用文本标记 `tutorialOnly`，不加入主课程的逐词慢读清单，不替换其既有声音源。

本轮现在时 read 例句使用明确的合成发音覆盖：清单的 `ttsText` 以同音拼写 reed 控制 /riːd/（参照 [Cambridge 发音](https://dictionary.cambridge.org/us/pronunciation/english/reed)），页面仍显示 read。原 read 单词和 We read books. 录音保留，另有 `ft-*` 教程版本；只有新教程点读选择它们。其余新短句更新本轮刚生成的录音。清单分别保存显示英文、实际合成文本及哈希，URL 同步更新版本，不向 TTS 发送 IPA，也不改写历史声音。字符与声学距离的诊断只能提示歧义，不能代替逐音真人审校。

`src/foundationDemos.ts` 另登记 **6 段固定示范**：Cambridge UK 的 map/ship 整词，以及美式 David 的两个句子重点、两个停顿版本。map/ship 与原音标表的本地英式 /m æ p ʃ ɪ/ 单音衔接；其他拼写词对统一使用美式 Aria/Guy。页面就地说明口音和固定声线，未无标记混合英美元音；IPA 不送进 TTS。

重点／停顿对比用本机 SAPI 控制整句合成，保留相同英文和同一美式声线，示范用于放大差异。自然整句仍有原 Aria/Guy 对照。`demo-manifest.json` 保存原站地址或合成定义、声线、文本、大小及哈希；`foundationDemoVersions.json` 为播放 URL 提供文件版本，避免更新示范后听到旧缓存。

新教程每条正常点读 1 倍，就地慢速 0.72 倍、保持音高。整句慢速保持一个连续录音，逐词区另提供独立单词；两者不互相冒充。原样章与其他分区的逐词慢读保持原行为。单音、整词、整句和固定示范共用原 `AudioPlayback`；换章／分区或播放另一段停止旧音，新材料失败在文章内提示重试。

维护命令：

```powershell
node scripts/foundation-audio-inventory.mjs
.venv\Scripts\python.exe tools/generate_foundation_audio.py --workers 6
scripts\generate-foundation-demos.ps1
```

固定示范可以通过 `-Ids @('focus-i','focus-tea')` 只更新对应文件。SAPI 临时 WAV 和编码临时文件放在系统临时目录，完成后才替换公开 MP3，避免 Windows 文件占用令 Vite 监听器退出。没有新增语音付费服务、运行时密钥或全局环境依赖。

### 本轮验收记录

证据目录为 `artifacts/foundation-expansion/`，使用隔离浏览器数据。检查对应本轮最终源码，具体结果在浏览器和声音审计报告中记录。

- `npx tsc --noEmit` 通过；`node --test tools/test-foundation.mjs` 14 项通过；`python tools/verify_foundation_audio.py` 完整解码 714 个文件，失败 0；`npm run build` 与 `npm run verify` 通过。
- `node tools/test-foundation-browser.mjs` 最终 26 个场景全部通过，失败 0、页面异常 0。覆盖全部 21 篇的新交互，四套配色与 1440/390/320px，正常／慢速、两声线、真实英式单音、固定示范、断网本地播放、失败重试与换章停止；原两篇样章、所有可见主题、课程返回及损坏历史原文保留继续回归。早前脚本使用旧导航名称导致的失败报告保留在 `browser-navigation-test-failure.json`，改用当前“课程”名称后完整重跑通过。
- `tools/audit-foundation-demos.py` 对实际重点／停顿 MP3 测量音高分布及内部停顿，确认存在声音差异，不能仅以加粗文字或播放事件代替。执行使用已有带 NumPy 的 `.runtime/slow-audio-venv/Scripts/python.exe`。
- `connected-speech-audit.json` 另记录两声线弱读／连读示范的实际录音核对：Windows 英语离线识别器选出的句中 can 为 /kən/，独立 can 为 /kæn/，句中 of 为 /əv/；整句内部最长静音 0–90ms，没有逐词分解中的长间隔。识别器的词典发音选择和静音测量只提供自动核对线索，不是逐音转写；Guy 句中 can 的词级置信度很低，不能用它单独证明该音准确。
- `node tools/test-phonemic-chart-browser.mjs` 15 个场景通过；`node tools/test-mobile-browser.mjs` 13 个场景通过。前者包含完整音标表与本地点读回归，后者检查原两区手机布局、键盘与答题控件。
- `history-preservation.json` 记录原主题、旧课程与例词完全一致，596 段原录音无改写。起点已有改动的 822 个文件逐一 SHA-256 核对未变；无新分支、提交、推送或发布。

生产 `dist` 中 714 段基础录音与 `public` 逐项 SHA-256 一致。`acceptance.json` 保存最终源码、清单和浏览器报告的哈希，以及本轮检查汇总；没有把中间失败报告当成最终结果。

专业真人发音审校与 Android 真机听感未进行；声学对比和浏览器播放不等于发音能力认证。旧 BBC 外部视频仍是可选补充，先前未取得播放证据，本轮没有把它变成新教程的必要步骤。E 组词形与简单构词留待后续明确授权。

## 早期实现与验收记录（2026-09-27）

2026-09-27：英语基础为独立教学区，不套用编程／日常英语的动态练习流程。语法保留目录与样章；按用户本轮确认，发音入口改为完整可点读的英式音标表，原教程作为下方可展开的补充。

## 交互音标表

- `src/phonemeInventory.ts` 定义传统英式教学的 44 音：12 个单元音、8 个双元音、24 个辅音。符号与单音／例词配对按 [Cambridge 音标指南](https://dictionary.cambridge.org/help/phonetics.html) 的 UK 行核对；不是所有语言的 IPA 总表，也不声称所有口音都使用同一个音素清单。/tr dr ts dz/ 是组合，不额外计为单音。/ɪə eə ʊə/ 保留传统标注，并提示现代口音差异。
- `src/PhonemicChart.tsx` 提供完整格子、点击即听单音、就地慢速、所选音的中文动作说明、同口音例词和易混音对比。桌面右侧显示详情；窄屏点击后定位到详情，可返回所选格子。全部声音自由访问，没有解锁、计分或学习存储。
- 按用户本轮明确要求，44 段单音和 44 段例词保存至 `public/audio/phonemes/uk/`，播放使用相对本地路径，不再请求 Cambridge。`manifest.json` 保留每段来源、音标、例词、大小与 SHA-256；来源均为原站对应单元格，/eɪ/ 与 /d/ 的 day 分别使用 `_002` 与 `_001`。正常 1 倍，慢速 0.72 倍且保持音高；后续正常点击恢复 1 倍。
- 表内固定英式示范，不使用 Aria／Guy，也不向 TTS 传入 IPA。原教程仍使用现有美式例词；两者分别标注，声音选择仅出现在教程中。表内新增英文例词由对应 Cambridge UK 文件覆盖，不纳入 Aria／Guy 本地生成器；原 298 个文本、596 个文件不变。
- 使用现有共享 `AudioPlayback` 管理互斥、超时、取消和真实播放状态；本地文件失败就地提示重试，原站仅作为手动参考入口。切导航、分区或播放其他内容均停止旧音，不以字母名或整词冒充单音。表内音频随本地网站／构建产物保存；外部参考链接及 BBC 视频仍需联网。远程网页首次加载仍需要网络，本次没有增加整站离线缓存或生成新版 APK。
- /f/、/v/ 详情可直接展开原样章。教程目录位于表格下方的「进一步学习」，外部原有主题入口仍能展开对应教程。
- 中文动作提示为本站编写；交互组织参考 [Sounds Right](https://learnenglish.britishcouncil.org/apps/learnenglish-sounds-right)。真人发音审校和 Android 真机播放不由浏览器事件代替。

音标表验收：`node tools/test-phonemic-chart-browser.mjs`；设置 `CODEWORDS_CHECK_ALL_PHONEMES=1` 时逐一播放完全部 88 段本地录音。所有场景阻断外部网络，仅允许本机站点，使用无预载音频缓存的新浏览器上下文。测试包括 12／8／24 完整分组、正常／慢速、失败恢复、离开停止、键盘操作、数据原文保留及四种风格的 1440／390／320px 布局。新报告位于 `artifacts/phonemic-offline/`；原在线验证和源站对照、失败下载记录保留在 `artifacts/phonemic-chart/`。

下载维护：`scripts/download-phonemic-audio.ps1` 使用普通 PowerShell HTTP 请求并按清单校验已有文件，最多重试三次连接故障。早前 Python 客户端曾得到源站 `403 / 1010`，普通 PowerShell 客户端可取得同一公开录音；不能据此把早前错误称为平台审批拒绝。`python tools/verify_phonemic_audio.py` 完整解码全部 88 段；`scripts/verify-phonemic-assets.mjs` 校验清单、源地址与文件哈希，已接入 `npm run verify` 和构建检查。

## 保留的教程

- 两条独立导航：「基础概念与语法」「音标与发音」。没有复习、知识库、收藏、掌握或统计入口。
- 推荐目录允许直接选择任何主题，也提供上一篇和接下来阅读；无解锁条件、固定答题轮次或计分。
- 语法样章：**名词和主语有什么区别**。具体疑问、中文解释、句子分块、代词与名词的对比例句、可跳过的理解互动。新增 The dog sees me. / I see the dog.，明确名词 dog 不变，整个 the dog 词组分别作主语和宾语。
- 发音样章：**/f/ 和 /v/：嘴形相同，声音哪里不同**。齿唇位置示意、清浊发音说明切换、BBC 官方嵌入播放器和原站链接、本地对比例词、跟读提示、可跳过的理解互动。
- 原有 56 个可见主题及新增的独立语法样章按两条线保留讲解；除两篇样章外，其他主题尚未逐篇按新流程改写。字母认识、字母表与手写内容继续隐藏。
- 四种风格共用清晰的中文在前排版；英文点读正常 1 倍、就地慢速 0.72 倍。切主题停止声音，切风格保留当前理解互动。
- 原编程／日常课程仍可打开相关基础解释，返回后保留原课程会话。

## 教学参考和推荐顺序

语法主要参考 [British Council A1–A2](https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2) 的专题讲解与理解活动。本站补齐零基础概念，采用先讲后试；目录范围作为校对依据，不直接照搬网站排列顺序。

推荐：单词／词组／句子 → 名词、动词、形容词与代词 → 词性和句中角色 → 基本句型 → 冠词、数量、词形、位置与所属 → 提问和否定 → 时间、比较和搭配。实际目录沿用现有内容的相对前置顺序，任何主题都可以跳读。

发音教学过程参考 [BBC The Sounds of English](https://feeds.bbci.co.uk/learningenglish/english/features/pronunciation/) 的观察、听音和跟读；就地操作参考 [Sounds Right](https://learnenglish.britishcouncil.org/apps/learnenglish-sounds-right)。推荐：音标入门 → 元音、双元音及辅音对比 → 音节与重音 → 连读、弱读、停顿、语调与词尾。

本站中文说明、拆解、位置图及互动为原创。BBC 示例通过 [官方 /f/ 与 /v/ 视频](https://www.youtube.com/watch?v=vE12RFyH-hY) 的官方嵌入播放器按需加载，并保留原站链接，没有复制其音视频。切换主题、离开发音区或点读例词会卸载播放器，避免后台继续播放。视频依赖网络：本次真实浏览器等待 20 秒未出现可播放控件，未取得播放证据；不能将嵌入框出现视为播放成功。检查记录见 `artifacts/foundation-tutorial/video-probe.json`。原样章阶段没有本地孤立音素录音；本轮已由上方音标表补齐 44 段单音及 44 段例词，不将字母名称或整词冒充单音。BBC 为英式，本地 Aria / Guy 为美式；样章只比较共有的 /f/、/v/ 发音动作。后续扩充元音教程须统一口音与标注，不直接混用英美元音。

## 实现和数据边界

`src/FoundationEnglish.tsx` 独立渲染教程与样章。语法样章使用 `foundation-noun-roles`，不占用 `foundation-word-order`；旧语序入口仍打开原语序标题和讲解。样章不进入历史课程题池。`src/foundation.css` 负责响应式和四主题外观。`src/foundationCourse.ts` 保留原主题、例词和历史题目身份。教程不导入课程调度器或写入学习记录，也不要求旧记录可解析。

`codewords-foundation-v1` 原文保留，包括收藏、学习证据、草稿和退休会话。`foundationProgress.ts`、旧题 ID、`hidden`／`referenceOnly` 与同步字段保持兼容；本次不清空历史数据、不修改同步协议、不新增存储键。旧 Node 测试继续验证这些兼容能力，不代表界面仍有动态课程。教程互动只存在当前页面内存，刷新或换章不保留答案；不新增学习追踪。

独立音频目录 `public/audio/foundation/aria/`、`guy/` 共 298 个文本、596 个 MP3。除复用原句子与词录音外，新增两句名词角色对比例句、共四个 Aria/Guy 录音。`src/foundationSamples.ts` 提供独立样章标识及音频文本，已接入清单生成和构建校验。IPA 符号只显示，不送进 TTS。

## 验收

- `npx tsc --noEmit`、`npm run build`。
- `node --test tools/test-foundation.mjs`：旧内容与身份、记录、退休会话、双客户端同步兼容。
- `node tools/test-foundation-browser.mjs`：两条目录、所有可见主题可达、两篇样章、可选互动、两声线真实播放事件和速率、原课程返回、数据不改写、损坏记录不阻断、四风格与 1440/390/320px 布局。证据在 `artifacts/foundation-tutorial/`。
- `node tools/test-mobile-browser.mjs`：原两区手机回归。此次输出独立放在 `artifacts/mobile-tutorial-regression/`。
- `python tools/verify_foundation_audio.py`：所有 596 个 MP3 完整解码。

本轮为本地网页交互音标表及保留教程，未提交、发布或生成 APK；浏览器播放事件不能代替真人发音审校或手机扬声器验收。原教程的后续主题全面改写不在本轮范围内。
