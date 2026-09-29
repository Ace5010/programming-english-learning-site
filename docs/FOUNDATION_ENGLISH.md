# 英语基础教程

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
