# 发布信息

- 线上网站：<https://ace5010.github.io/programming-english-learning-site/>
- GitHub 仓库：<https://github.com/Ace5010/programming-english-learning-site>
- 发布分支：`main`
- 部署方式：GitHub Actions 构建 Vite 项目并发布 `dist`

每次推送到 `main` 后，工作流会安装锁定依赖、执行生产构建、核验 3,560 词和 7,122 个固定音频资产，再部署到 GitHub Pages。
