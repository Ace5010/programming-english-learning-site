# 发布信息

- 线上网站：<https://ace5010.github.io/programming-english-learning-site/>
- GitHub 仓库：<https://github.com/Ace5010/programming-english-learning-site>
- 发布分支：`main`
- 部署方式：GitHub Actions 构建 Vite 项目并发布 `dist`

每次推送到 `main` 后，工作流会安装锁定依赖、执行生产构建、核验 3,560 词及双声线音频，再部署到 GitHub Pages。新版 dist 只包含 Aria / Guy 共 14,242 个音频；旧 Piper 文件仍保留在源码中，但构建后会移除其 dist 副本，以保持部署文件数低于 20,000。详见 NEURAL_AUDIO.md。
