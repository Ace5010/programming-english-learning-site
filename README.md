# 英语学习网站

这是一个面向零基础学习者的中英双语英语学习网站。编程英语帮助阅读 GitHub、代码和技术文档；日常英语提供独立的生活交流课程，两条路线可以并行学习。

## 日常英语：首批四个单元

- 打招呼与姓名、来自哪里、介绍身边的人、认识日常物品，共 24 节课程；第四单元最后一课综合前四个单元。
- 83 条双语点读材料，Aria / Guy 各 83 个静态 MP3；120 道主练习和 48 道变式复查。
- 课程学习、按题型筛选的练习册、到期复习与难点复查；选择、听音、排序、多空填空、写句和表达自查。
- 自动保存当前题目、输入、提示使用和反馈；切换风格或学习分区后可继续。12 道口语题支持点击麦克风跟读，显示识别文字并标出漏识别、不同词和多余词；自由表达可语音转文字后自查。文字匹配不代表自动发音评分。
- 日常英语只写入独立的 `codewords-daily-v1`；`codewords-section` 记住分区。原有编程词汇、分类、音频及学习记录保留。
- 完整说明、测试与截图见 [日常英语首批交付](docs/DAILY_ENGLISH.md)，长期目录见 [课程方案](docs/DAILY_ENGLISH_CURRICULUM.md)。

## 已完成内容

以下为原有编程英语分区能力，新增日常英语后继续保留。

- 3,560 个英语词汇，包含中文释义、分类、音标和双语例句
- 桌面顶部导航、连续词汇列表和右侧复习区：单词与中文释义横向对齐，双语例句直接可见；点击单词或词条空白处点读，点击例句朗读整句，星标收藏和掌握操作就近显示
- 简约高级、手绘笔记、彩色版画、美式涂鸦四种界面风格，覆盖词汇、设置、全部练习和反馈；导航各有对应动效，支持系统“减少动态效果”设置
- 右上角切换风格并记住偏好，复习中也可切换；保留当前筛选、已加载词条、题目和输入。默认简约高级，风格仅使用独立的 `codewords-theme` 存储键
- 手机自动改为纵向词条，单词和例句的播放反馈跟随真实音频事件
- 例句优先使用日常基础词和短句；人工校对例句在 `scripts/simple-examples.txt`，其余从原词典资料中优先选择较简单的完整句
- Aria 美式女声 / Guy 美式男声，可切换并记住偏好
- 双声线共 14,242 个 MP3：每套 3,560 个单词、3,560 个例句、1 个试听音频；旧 Piper 文件保留供回溯，不进入新版部署
- 收藏、掌握标记、学习进度和[渐进式复习练习](docs/REVIEW_PRACTICE.md)：单词配对、听音选词、渐进听写、句子选词填空交替进行；每轮最多 5 个词、10 道基础练习，另加最多 5 道纠错复查
- 听写支持连续键盘输入、输入法确认后自动跳格、左右键切换和退格修改；Enter 检查答案，再按一次继续
- 手机与桌面响应式排版
- 无访客登录；固定点读无需运行时语音服务。口语识别使用浏览器能力，可能需要浏览器的联网语音服务
- 可直接部署的 `dist` 成品
- 完整的词汇及语音再生成工具

线上版本：<https://ace5010.github.io/programming-english-learning-site/>

本地视觉改版的参考、前后截图和测试结果见 [视觉改版验收](docs/VISUAL_REDESIGN.md)。
四种已确认风格的正式接入、功能保留说明与新截图见 [四风格改版验收](docs/THEME_ROLLOUT.md)。

## 项目结构

```text
编程英语学习网站/
├─ src/                         网页源码与 3,560 词数据
├─ public/audio/aria/          7,121 个美式女声音频
├─ public/audio/guy/           7,121 个美式男声音频
├─ public/audio/daily/         日常英语专用双声线音频与文本校验清单
├─ public/audio/piper-lessac/  7,122 个旧语音文件（保留）
├─ tools/
│  ├─ generate_neural_audio.py Aria / Guy 可续跑生成器（见 docs/NEURAL_AUDIO.md）
│  ├─ generate_piper_audio.py  旧 Piper 语音生成器
│  ├─ requirements.txt         Python 依赖
│  └─ models/                  Lessac 模型和配置
├─ scripts/
│  ├─ build-vocabulary.mjs     词汇数据生成器
│  └─ core-vocabulary.txt      核心编程词汇
├─ sources/
│  ├─ it-glossary/             IT 专业词汇来源与原始资料
│  └─ beginner-english/        初高中基础英语来源数据
├─ dist/                       本地构建生成的网页（不提交到 Git）
├─ docs/                       项目清单和说明
├─ index.html
├─ package.json
└─ vite.config.ts
```

## 直接运行

建议使用 Node.js 24；日常课程校验读取 TypeScript 数据需要 Node.js 22.18 或更新版本。在项目目录运行：

```powershell
npm install
npm run dev
```

本地开发地址固定为 `http://localhost:5186/`，端口被占用时会报错，不会自动换地址。
也可运行 `powershell -NoProfile -File scripts/Open-LocalSite.ps1`，它会启动本项目、确认页面身份后打开 Chrome；加 `-CheckOnly` 只检查启动结果。
本地学习记录属于浏览器和地址，换端口前需要备份并迁移；线上 Pages 的记录与本地独立。

构建静态网页：

```powershell
npm run build
```

检查词汇、语音和关键项目文件是否完整：

```powershell
npm run verify
```

## 重新生成词汇

```powershell
npm run generate:vocabulary
```

生成器只使用本项目 `sources` 内的资料，不依赖原工作目录。

## 重新生成固定语音

当前 Aria / Guy 双声线的再生成方法见 [双声线说明](docs/NEURAL_AUDIO.md)。以下保留旧 Piper 音频的再生成方法，仅用于回溯。

先创建 Python 环境并安装 Piper：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools\requirements.txt
```

生成缺失语音（已有文件会自动跳过）：

```powershell
.\.venv\Scripts\python.exe tools\generate_piper_audio.py --site . --model tools\models\en_US-lessac-medium.onnx
```

工具还支持 `--start`、`--limit` 和 `--force`，可分批生成或强制重建。

## 说明

- `node_modules` 已保留在本地整合目录中，方便直接运行；它属于可重新安装的依赖缓存，不计入固定资产校验清单。
- Python `.venv` 属于机器环境，未固定打包；可用 `tools/requirements.txt` 在项目内随时重建。
- Piper 模型文件已经收进项目，重新生成语音时无需再单独下载模型。
- `dist` 是本地构建产物；GitHub Actions 会在每次推送到 `main` 后重新构建并部署到 GitHub Pages。
