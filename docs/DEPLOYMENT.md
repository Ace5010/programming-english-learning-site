# 词见发布信息

网站显示名称统一为「词见」。现有网址、Cloudflare 项目标识、D1 绑定和学习记录键继续沿用，避免更换地址影响原有学习记录。

- 实际学习站点：https://programming-english-learning-site.pages.dev/
- 备用静态站点：https://ace5010.github.io/programming-english-learning-site/
- GitHub 仓库：https://github.com/Ace5010/programming-english-learning-site
- 发布分支：`main`
- Cloudflare Pages 使用现有 GitHub 集成，运行生产构建并部署 `dist` 和根目录 `functions`。`wrangler.jsonc` 配置专用 D1 同步绑定，详见 [设备同步](SYNC.md)。
- GitHub Actions 继续构建和发布静态 `dist`，同步请求使用指定 Cloudflare 接口。

生产构建核验 3,620 个词、Aria / Guy 各 7,241 个编程音频及 626 个日常音频。日常主线为 72 个独立单词，原学习记录、收藏、旧题目和存储键继续保留；同步 Function 与 D1 配置沿用。旧 Piper 仍保留在源码中，构建后移除其 dist 副本，使部署文件数低于 20,000。推送后需核对 Cloudflare 正式部署及线上实际资源版本。
