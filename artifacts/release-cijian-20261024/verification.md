# 词见线上发布验收

日期：2026-10-24（Asia/Shanghai）。

## 发布结果

- 源码提交：`d403470344cebd6cd752a78d79807dba0b9472f1`，已推送现有 `main` 分支。
- 正式站：`https://programming-english-learning-site.pages.dev/`。
- Cloudflare 当前正式部署：`cf21fa5b-c92a-41a1-92ae-4031945a5731`；发布状态 success，关联上述提交。直接上传的同提交部署 `9bad716d-9806-49ec-9236-babef92a7648` 也已成功，随后 Git 集成的同版本部署成为 canonical deployment。
- 备用站：`https://ace5010.github.io/programming-english-learning-site/`。
- GitHub Pages workflow：`40061887126`，completed / success，关联上述提交。
- 两站标题均为「词见」，线上脚本为 `assets/index-CUjUjbXz.js`。备用站 JS 与 CSS 已逐字节计算 SHA-256，与本地构建相同。

## 检查

- 本轮 `npx tsc --noEmit`、`npm run build`、`npm run verify` 全部通过。部署文件 16,571 个，未包含 `.part` 临时音频。
- Chrome 实际打开正式站，浏览器标题为「词见」，加载的脚本与样式文件名和本地构建一致。
- 正常点读 constant、局部慢速点读均观察到对应真实播放状态；没有开始测试、跳课或修改学习记录。
- 刷新后保留原来的编程第 4 节、已完成 3 节；同步按钮显示「设备同步：进度已同步」。
- 日常英语仍能打开原有会话；英语基础教程正常展示。检查后恢复原来的编程英语分区。
- 390×844 手机视口检查没有横向溢出，截图保存于本目录；结束后恢复原浏览器视口。
- Cloudflare 项目 API 确认 production canonical deployment 为本次提交且状态 success；`CODEWORDS_SYNC_DB` 仍绑定原 D1 数据库，未执行迁移或数据变更。
- 受跟踪源码工作区干净。原有未跟踪的验收产物和未完成录音继续保留，未纳入本次提交。

## 登录与范围

本轮经用户现场同意，恢复既有 Wrangler 的四项授权：用户读取、账户读取、Pages 发布、后台续期。OAuth 凭证由 Wrangler 保存在本机配置中；授权截图移至 `.runtime/cijian-release-20261024/`，未加入 Git。

网站显示名和本地工程名已统一，现有域名、Cloudflare 项目标识、D1 绑定与原学习记录键作为兼容标识保留。本次未修改仓库名称或域名。
