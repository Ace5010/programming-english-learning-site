# 1. 项目简介

这是一个面向零基础学习者的中英双语编程英语学习网站，帮助用户阅读 GitHub、代码和技术文档。

目前已实现 3,560 条词汇、分类检索、单词与例句点读、慢速播放、收藏、掌握标记、学习进度和十题测验。网站使用 7,122 个本地 Piper Lessac 美式英语 MP3，已包含可部署的 `dist` 成品，以及词汇、语音再生成工具。

项目当前是纯静态前端，没有后台服务。学习状态只保存在浏览器 `localStorage`。

# 2. Agent 工作原则

- 修改前先阅读相关实现、配置和 Git 状态。不得覆盖、回退或删除用户已有但与当前任务无关的改动。
- 优先修改现有代码，以完成任务所需的最小范围为准。
- 不擅自重构正常模块，不顺手整理无关代码。
- 不擅自新增功能或超出任务范围的模块。
- 优先使用现有依赖和原生能力。确需新增依赖时，应说明用途、必要性和对构建体积、维护成本的影响；涉及明显架构影响或重量级依赖时，先询问用户。
- 涉及框架迁移、数据结构重做、存储方式变化或新增后台、扩展等重大架构调整时，先询问用户。
- 遇到问题先做安全、可逆的排查；确实缺少权限或必须由用户决策时再请求协助。

# 3. 不可破坏的规则

- 项目当前不需要 API Key、Cookie 或 Token。不得把敏感信息写入源码、前端环境变量、日志或提交记录；Vite 前端环境变量会暴露给浏览器，不能用于保存秘密。
- 项目没有数据库。不得擅自引入数据库或远程账户系统；修改 `localStorage` 键名或数据格式时必须兼容已有学习记录，或提供迁移方案。
- 不随意固定或修改开发端口、预览端口和 `vite.config.ts` 中的部署基础路径；确需修改时同步检查运行命令、相对资源路径和部署说明。
- 不直接编辑 `node_modules/`、`.git/` 或 `dist/` 中生成的网页代码。更新 `dist/` 时应修改源码后重新构建。
- 不无故删除、覆盖或批量重新生成 `public/audio/piper-lessac/`、`sources/`、`tools/models/` 和 `src/vocabulary.ts`。
- 当前基准数据为 3,560 条词汇和 7,122 个非空 MP3。除非任务明确涉及数据增删，否则修改不得意外改变这些数量。
- 未经用户明确要求，不执行发布、推送、提交、重写 Git 历史或破坏性文件操作。

# 4. 修改后的检查

- 修改 TypeScript 或 React 组件：运行 `npx tsc --noEmit`。修改样式或布局：进行页面冒烟检查。涉及运行逻辑、资源路径或构建配置时，再运行 `npm run build`。
- 修改词汇、语音、模型、来源数据或项目结构：运行 `npm run verify`，确认词汇数量、语音数量、缺失文件和零字节文件。
- 修改依赖：确认 `package.json` 与 `package-lock.json` 同步，运行 `npm ls --all`、类型检查和生产构建。
- 仅修改文档或注释：检查内容与当前实现一致，并查看 `git diff`；不机械运行无关构建。
- 项目当前没有独立的 lint 或单元测试脚本，不得把未执行或不存在的检查报告为通过。

# 5. 项目地图

- 前端入口：`src/main.tsx`
- 页面功能：`src/App.tsx`
- 页面样式：`src/styles.css`
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
