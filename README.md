# 编程英语学习网站

这是一个面向零基础学习者的中英双语计算机英语点读网站，目标是帮助学习者读懂 GitHub、代码和技术文档。

## 已完成内容

- 3,560 个英语词汇，包含中文释义、分类、音标、双语例句和拼写展示
- 单词点读、例句朗读和慢速播放
- Piper `en_US-lessac-medium` 固定美式英语音源
- 7,122 个 MP3 文件：3,560 个单词、3,560 个例句、2 个试听音频
- 收藏、掌握标记、学习进度和十题测验
- 手机与桌面响应式排版
- 无访客登录、无运行时语音接口依赖
- 可直接部署的 `dist` 成品
- 完整的词汇及语音再生成工具

线上版本：<https://ace5010.github.io/programming-english-learning-site/>

## 项目结构

```text
编程英语学习网站/
├─ src/                         网页源码与 3,560 词数据
├─ public/audio/piper-lessac/  7,122 个固定语音文件
├─ tools/
│  ├─ generate_piper_audio.py  可续跑的语音生成器
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

电脑已安装 Node.js 时，在项目目录运行：

```powershell
npm install
npm run dev
```

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
