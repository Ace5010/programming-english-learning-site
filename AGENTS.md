# 1. 项目简介

这是一个面向零基础学习者的中英双语编程英语学习网站，帮助用户阅读 GitHub、代码和技术文档。

目前已实现 3,620 条词汇（原 3,560 条及 ID 保留，追加 60 条）、分类检索、点读、慢速、收藏，以及动态课程、渐进练习与长期复习。两区课程与练习册合并，只展示当前动态编排的一节；下一节根据实际表现补弱、减少或增加新内容，不预先固定实际课数。首次教学仅标记正在学习，达到信心与间隔迁移条件后才准入长期复习；复习出现的新困难可回流后续课程补学。不再提供手动掌握。网站点读使用本地 Aria / Guy 双声线 MP3，每套 7,241 个；旧 Piper Lessac 的 7,122 个 MP3 保留供回溯。项目包含可部署的 `dist` 成品，以及词汇、语音再生成工具。

学习状态优先保存在原有 `localStorage`。按用户 2026-09-23 的跨端同步要求，增加 Cloudflare Pages Function + D1 的可选私人同步码服务，见 `docs/SYNC.md`。没有注册账户系统；未配对设备继续只在本机保存。

另有 `android/` 原生 WebView 测试壳，打包同一个 `dist`（完整双声线音频），通过受限本地 HTTPS origin 加载，继续使用 WebView 本机 `localStorage`，与浏览器使用同一私人同步码后共享学习记录。另有系统语音识别和系统文件选择器导出，见 `docs/ANDROID_TESTING.md`。保持包名 `com.codewords.english` 及本机签名以支持覆盖升级；不得提交 `.runtime/`、签名密钥、`android/keystore.properties` 或 APK。当前真机安装、系统识别与系统文件保存尚待验收，不能把 Chrome 仿真或编译成功称为真机验证。

另有独立日常英语分区，首批材料为 A1-01—A1-04 四个单元、24 个教学范围，见 `docs/DAILY_ENGLISH.md`。材料在 `src/dailyCourse.ts`，候选题在 `src/dailyPractice.ts`，页面在 `src/DailyEnglish.tsx`，进度在 `src/dailyProgress.ts`；使用独立 `codewords-daily-v1`，不得映射或覆盖编程英语的词汇 ID 与记录。日常音频单独放在 `public/audio/daily/`，不计入编程各声线的 7,241 个录音。编程材料在 `src/programmingCourse.ts`、候选题在 `src/programmingPractice.ts`，同为 4 单元、24 个教学范围；两区共用 `src/adaptiveLearning.ts` 和页面交互。材料范围不代表用户实际只学 24 节。编程课程独立键为 `codewords-programming-course-v1`。

旧 `codewords-mastered` 原文保留，其词继续准入复习并跳过全新教学；复习表现可使其回流补学。`codewords-review-v1` 兼容旧两能力记录，词义、语境、拼写和听力只记录实际测试证据。课程 `learning`、会话 `adaptive` 和词级准入信息通过可选字段扩展，不能重置旧记录。保存随机状态及已选题目，刷新必须续接而非重抽。本项目使用可检验的本地规则，不宣称复刻 Duolingo 私有算法，不新增 AI 或后台服务；详见 `docs/COURSE_SYSTEM.md`。

# 2. Agent 工作原则

- 修改前先阅读相关实现、配置和 Git 状态。不得覆盖、回退或删除用户已有但与当前任务无关的改动。
- 优先修改现有代码，以完成任务所需的最小范围为准。
- 不擅自重构正常模块，不顺手整理无关代码。
- 不擅自新增功能或超出任务范围的模块。
- 两区顶部导航保留独立“收藏”页，直接展示本分区已有收藏，不能只把入口藏在词汇库／表达库的筛选菜单。沿用原收藏存储、逐条点读与取消收藏；收藏页搜索不受词库筛选影响，收藏操作不能变成掌握或复习准入证据。
- 动态课程必须按既有表现安排下一节和本轮下一题；不能退回固定 24 课、固定每词练习次数或首次教学即长期复习。题目只能测试已介绍目标或当前确认教学的目标，未测试能力不能计为正确。口语自查不自动增加掌握或长期准入证据。
- 网页设计以清晰、易读和实际用途为准。除非用户本人明确要求，不新增或保留意义不明、仅用于装饰的文字或字段，例如无实际用途的英文标题、英文副标题、口号、标签和编号。用于学习的英语词汇、例句及必要的功能说明不属于装饰文字。
- 除非用户本人明确要求，不使用特别小的文字作为装饰或营造层次。非必要的辅助文字不保留；确有必要的信息应使用清晰可读的字号，不得为了排版而缩小到难以阅读。
- 当前界面以 Busuu 官方词汇复习截图为主要参考：桌面采用顶部导航、连续词汇列表和右侧复习区，手机使用纵向词条。保留星标收藏、点击单词或词条空白处正常朗读单词、点击例句正常朗读整句。每个可点读的单词、例句和表达都必须在发音图标／音标旁就地提供慢速按钮，点击即播放当前内容；包括两区课程卡片、复习、词汇／表达库、题目、反馈及结果页。不能用页面顶部的全局语速切换代替逐条操作，不能要求滚回页首。普通点读固定正常 1 倍，局部慢速为 0.72 倍并保持音高，不受前一个词选过慢速影响。沿用原语速偏好键供已有自动播放／语音设置使用；切速不能重建题目或清除草稿。功能说明简短、就近显示，播放动效跟随真实音频事件。
- 在上述真实功能与内容结构上，用户已确认简约高级、手绘笔记、彩色版画、美式涂鸦四种可切换风格，默认简约高级。样式位于 `src/themes.css`、`src/themeLesson.css`，导航动效位于 `src/useThemeMotion.ts`。新增或调整功能时同步适配四种风格；切换风格不得重建练习或重置学习状态。验收见 `docs/THEME_ROLLOUT.md`。
- 例句面向零基础学习者：保留目标词的含义，周围尽量使用日常基础词和简短完整句，避免用多个难词解释一个词。修改例句必须同步更新 Aria / Guy 对应录音，并检查浏览器缓存，不能出现文字与发音不一致。
- 优先使用现有依赖和原生能力。确需新增依赖时，应说明用途、必要性和对构建体积、维护成本的影响；涉及明显架构影响或重量级依赖时，先询问用户。
- 涉及框架迁移、数据结构重做、存储方式变化或新增后台、扩展等重大架构调整时，先询问用户。
- 遇到问题先做安全、可逆的排查；确实缺少权限或必须由用户决策时再请求协助。

# 3. 不可破坏的规则

- 本地学习不需要 API Key、Cookie 或 Token；同步码是设备间共享的私人凭证，仅由用户设备生成和保存，云端仅保存其哈希。不得把真实同步码写入源码、日志、截图、文档或构建产物。不得把敏感信息写入源码、前端环境变量、日志或提交记录；Vite 前端环境变量会暴露给浏览器，不能用于保存秘密。
- D1 仅用于用户已授权的进度同步。不得擅自扩展为远程账户系统或用于其他数据；修改 `localStorage` 键名或数据格式时必须兼容已有学习记录，或提供迁移方案。
- 不随意固定或修改开发端口、预览端口和 `vite.config.ts` 中的部署基础路径；确需修改时同步检查运行命令、相对资源路径和部署说明。
- 不直接编辑 `node_modules/`、`.git/` 或 `dist/` 中生成的网页代码。更新 `dist/` 时应修改源码后重新构建。
- 不无故删除、覆盖或批量重新生成 `public/audio/piper-lessac/`、`sources/`、`tools/models/` 和 `src/vocabulary.ts`。
- 原始身份基线为 `scripts/vocabulary-baseline.json` 中的 3,560 条词汇；当前追加后共 3,620 条，不得删除或重排旧 ID。旧 Piper 保持 7,122 个非空 MP3。新增词必须显式追加到补充清单并同步现用双声线。
- 当前点读音频为 `public/audio/aria/`、`public/audio/guy/`，各 7,241 个 MP3。例句更新流程见 `docs/NEURAL_AUDIO.md`；不要用仅跳过已有文件的旧生成方式遗漏变更录音。
- 未经用户明确要求，不执行发布、推送、提交、重写 Git 历史或破坏性文件操作。

# 4. 修改后的检查

- 修改 TypeScript 或 React 组件：运行 `npx tsc --noEmit`。修改样式或布局：进行页面冒烟检查。涉及运行逻辑、资源路径或构建配置时，再运行 `npm run build`。
- 修改两区课程或进度时，额外运行 `node --test tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs`。修改日常课程或进度时，运行 `node --test tools/test-daily-content.mjs tools/test-daily-progress.mjs`。新句子或英文文本改变时使用专用生成器同步两套日常录音，运行 `python tools/verify_daily_audio.py` 完整解码。`build` / `verify` 均检查日常音频清单、文本和文件哈希；不要只增加空课程目录。
- 修改自适应编排、候选题或准入时，另运行 `node --test tools/test-adaptive-learning.mjs tools/test-daily-practice.mjs tools/test-programming-practice.mjs tools/test-programming-review.mjs`，验证动态轮次、有限结束、迁移准入、弱项回流及刷新恢复。当前动态浏览器证据位于 `artifacts/adaptive-course/`；`artifacts/course-system/` 的旧 48 课、240 题固定流程结果仅为历史阶段证据，不能替代最终动态验收。
- 修改词汇、语音、模型、来源数据或项目结构：运行 `npm run verify`，确认词汇数量、语音数量、缺失文件和零字节文件。
- 修改依赖：确认 `package.json` 与 `package-lock.json` 同步，运行 `npm ls --all`、类型检查和生产构建。
- 修改安卓壳：运行 `scripts/Build-Android.ps1 -Validate`（工具链参数见安卓文档）、`node --test tools/test-native-android.mjs`、`python tools/verify_android.py <apk>` 及 APK 签名检查。网页布局变更覆盖 `tools/test-mobile-browser.mjs`；原生功能需要另外验证设备安装、权限和系统回调。运行 Android Lint 与前端检查是不同步骤。
- 仅修改文档或注释：检查内容与当前实现一致，并查看 `git diff`；不机械运行无关构建。
- 项目没有独立的 lint 或 `npm test` 命令；`tools/test-*.mjs` 为按需执行的 Node 或隔离浏览器测试。不得把未执行或不存在的检查报告为通过。

# 5. 项目地图

- 前端入口：`src/main.tsx`
- 页面功能：`src/App.tsx`
- 页面样式：`src/styles.css`
- 共享课程页面：`src/DailyEnglish.tsx`
- 动态编排与学习状态：`src/adaptiveLearning.ts`、`src/learningTypes.ts`、`src/dailyProgress.ts`
- 候选题池：`src/dailyPractice.ts`、`src/programmingPractice.ts`
- 编程长期复习衔接：`src/programmingProgress.ts`、`src/programmingReview.ts`
- 词汇数据：`src/vocabulary.ts`
- 固定语音：`public/audio/piper-lessac/`
- 静态构建成品：`dist/`
- 词汇生成：`scripts/build-vocabulary.mjs`
- 原始资料：`sources/`
- 完整性检查：`tools/verify_project.py`
- 语音生成：`tools/generate_piper_audio.py`
- Piper 模型：`tools/models/`
- 项目与部署说明：`README.md`、`docs/`

# 6. 技术参考

- React / React DOM
- Vite / `@vitejs/plugin-react`
- TypeScript
- Node.js / OpenCC.js
- Python / Piper TTS / FFmpeg
- Piper `en_US-lessac-medium`

具体版本及 Node.js 要求以 `package.json`、`package-lock.json`、`tools/requirements.txt` 和相关依赖配置为准。

常用命令：

```powershell
npm install
npm run dev
npx tsc --noEmit
npm run build
npm run preview
npm run verify
npm run generate:vocabulary
npm run generate:audio
```

语音生成依赖不会影响网站日常运行；只有重新生成语音时才需要安装 `tools/requirements.txt` 中的 Python 依赖并确保 `ffmpeg` 可用。
