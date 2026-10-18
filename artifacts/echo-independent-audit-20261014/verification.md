# 独立英语桥复查与交付门槛

> 2026-10-17：用户实测后取消此方案，原语音验收任务随之取消。网站、插件连接与读取授权均已撤回；本文件仅作历史记录。最终撤回结果见 [撤回记录](../echo-removal-20261017/verification.md)。

2026-10-14。范围为本次英语网站只读桥、独立“英语学习”插件、原 Echo 接入及 Pocket 英语扩展退役。**自动、浏览器、正式云端及真实插件检查已完成；正在进行的原 Echo 电话中读取、练习后重读和失败说明仍待实际证据，尚未最终交付。** 没有新建分支、提交或推送；原有未发布改动继续保留。

## 复现并修复的遗漏

1. `src/echoOAuth.ts` 在授权页、同意提交和 Token 三个分支直接返回异步调用，数据库错误会绕过外围 `catch`。新增的三个异常注入测试在修复前全部失败，修复后全部通过。分支改为 `return await`，现在稳定返回脱敏 JSON 503，不泄露数据库详情或伪造授权成功。
2. 浏览器有格式正确但云端无效的旧同步身份时，授权页提示输入一次性连接码，却继续发送旧身份 Header，导致有效连接码无法回退。真实 Chrome 隔离场景复现失败；现在提交连接码时使用该连接码验证，同浏览器的正常自动授权保持原流程。桌面和手机尺寸的正常授权、旧身份回退共四个场景通过，均阻断公共网络请求。

另发现旧截图基线取自本地工作区，其中 `readme` 音标属于未发布内容，不能当作正式网站前后对照。重新从改造前实际线上不可变发布 `65ff6a70-6330-46bb-8bbf-68d4ee7c1a29` 取得 HTML/JS/CSS，以同一数据和随机种子进行前后截图比较，16 组全部通过。没有为通过测试修改网站内容。

## 实际验收

| 项目 | 结果与证据范围 |
|---|---|
| 前端 TypeScript、Functions 严格类型检查 | 两项通过 |
| 英语桥、独立 OAuth、课程和同步 Node 检查 | 106/106；另课程升级与旧草稿同步 8/8，共 114 项 |
| 实际 workerd / D1 | 1/1，通过；独立英语 handlers、真实 SQLite D1，禁止全部出站 |
| 原 Pocket OAuth / MCP / Cloudflare | 102/102，通过；全部使用隔离测试存储与接口 |
| 自动检查合计 | 217 项通过，无跳过；命令清单见下方 |
| 正式网页前后对照 | 16 组：两区的课程、复习、词汇库、收藏，1440 和 390 宽度；CSS SHA-256 与原线上版本相同 |
| 当前词句、正常／慢速点读 | 两个 Chrome 尺寸通过；真实 MP3 播放，正常 1 倍、慢速 0.72 倍并保持音高，点读不改学习记录 |
| 两区练习与刷新 | 两个尺寸通过；编程原选择题结果更新、日常原练习结果更新，刷新保留原草稿，跨分区保留未完成编程练习 |
| 日常自查的证据边界 | 实际抽到原 `A1-01-01-p-hello-oral-repeat`，保留 `outcome=self`；测试没有将自查称为独立口语评分或掌握证据 |
| 离线／页面关闭 | 两个尺寸通过；离线不冒充新云记录，恢复网络后更新；页面关闭时 `stale=true`；滚动／鼠标移动不额外上传 |
| 源文件保护 | 英语原同步四文件与开工前 SHA-256 一致；Pocket 四个原接入文件也与开工前字节一致 |
| 正式发布 | `bebf5028-0482-4102-b4db-3aa61a92f785`，由原正式基线仅叠加本任务文件；本轮修复发布前后前端 HTML/JS/CSS 字节不变 |
| 发布包资源 | 构建通过，16,115 个文件；日常 172、阅读 582、基础 708、单音及例词 88 段，原双声线完整 |
| 工作区资源完整性 | `npm run verify` 通过：3,620 词、Aria / Guy 各 7,241、旧 Piper 7,122、零缺失和空文件；包含原有未发布的基础录音 710 段，与正式包 708 段分别记录 |
| 生产数据与授权保护 | 修复发布前后 7 档案、14 分片摘要完全一致；本人原连接保留，30 天绝对到期时间未变化；发布没有数据库迁移或学习写入 |
| 真实正式云链路 | 6 项通过：当前课、草稿保留、未同步答案、同步后结果、离页过期、撤销和全部原档案保护；生成的独立测试档案，非真人学习 |
| 真实独立插件 | 发布前后都实际调用安装的独立工具 `mode=current`，连接成功、课程正确、版本 96；均如实返回过期标记及最后上传来源，非活动通话证据 |
| Pocket 正式恢复状态 | 版本仍为 `1390097a-3c35-4d12-9dbb-348ea509374f`、健康 configured；临时英语 secret 不存在；D1 primary 确认旧英语文档 retired，grant/candidate 均已移除 |
| 原 Echo 与持久语音线程 | 前轮各自实际独立读取已记录；当时电话已结束，不能替代当前活动通话验收 |
| 活动电话与练习更新 | **待验收**：已向本人集中请求一通原 Echo 电话及一道原网站练习；没有重复请求插件授权，没有主动拨号或替用户作答 |

报告：[授权 Chrome](oauth-browser/report.json)、[内容与原练习 Chrome](context-browser/report.json)、[真实线上基线](original-production-baseline.json)、[页面对照](production-layout/after/report.json)、[发布回执](deployment-receipt.json)、[真实云端](live-cloud-report.json)、[真实插件读取](real-plugin-read.json)。

真实云端测试在修复发布后创建了单独测试档案；全部已有 7 档案摘要未变，测试授权已撤销，测试学习记录保留。正式云端的 6 项检查与自动浏览器生成的练习均不能冒充本人在电话中的学习经历。手机尺寸不是物理手机；本轮没有修改或发布 Android 壳，真机未验证。

本轮出现的测试准备失败也已区分：日常新增浏览器检查起初误以为可以从首页直接“开始练习”、固定第一题为选择题、提交按钮必定叫“检查”；按原网站实际“开始学习 → 开始练习”及动态题型／原提交按钮修正测试，真实网站没有因此调整。发布源码目录未含未跟踪的完整项目验证脚本，因此资源完整性命令在原工作区执行；正式包另由构建完整性检查验证。没有将这些准备失败报告为产品回归或隐去最终未通过项。

## 实际执行命令

```powershell
npx tsc --noEmit
npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --resolveJsonModule --lib es2022,dom,dom.iterable --skipLibCheck --strict functions/api/echo.ts functions/api/echo-mcp.ts 'functions/api/echo-oauth/[route].ts' functions/.well-known/oauth-authorization-server.ts functions/.well-known/oauth-protected-resource/api/echo-mcp.ts
node --test tools/test-echo-oauth.mjs tools/test-echo-bridge.mjs tools/test-progress-sync.mjs tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs tools/test-daily-content.mjs tools/test-daily-progress.mjs
node --test tools/test-course-upgrade-sync.mjs
node --test tools/test-echo-workerd.mjs
node tools/test-echo-oauth-browser.mjs
node tools/test-echo-context-browser.mjs
node tools/test-echo-bridge-browser.mjs before
node tools/test-echo-bridge-browser.mjs after
npm run build
npm run verify
```

Pocket 在其原目录执行 `node --test tests/companion-oauth.test.mjs tests/companion-oauth-store.test.mjs tests/companion-oauth-pairing.test.mjs tests/companion-mcp.test.mjs tests/companion-cloudflare.test.mjs`。workerd 使用已有 Wrangler 依赖路径；浏览器以新 `CODEWORDS_ARTIFACT_DIR` 保留本轮证据，并用 `CODEWORDS_BASELINE_DIR` 指向真实线上基线。构建仅在独立发布目录执行，完整项目 verify 在原工作区执行。
