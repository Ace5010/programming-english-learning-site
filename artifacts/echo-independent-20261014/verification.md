# 独立英语只读 Echo 桥验收

> 2026-10-17：用户已取消整个 Echo 英语桥方案。网站、插件连接与读取授权均已撤回；以下发布地址和验收状态仅作历史记录。最终撤回结果见 [撤回记录](../echo-removal-20261017/verification.md)。

2026-10-14。用户明确选择“改为独立英语插件，继续用原 Echo”。新入口已部署在英语网站自己的 Pages Functions / D1；不依赖 Pocket 的工具注册、OAuth 身份、凭据、服务密钥或授权文档。**独立插件已按本人明确同意完成 30 天只读授权并实际连接。原 Echo 与同一持久语音线程均已实际调用新独立工具成功；当时实时通话已经结束，活动通话及练习后语音更新验收仍未完成，不宣称全部验收通过。**

当前正式入口：`https://programming-english-learning-site.pages.dev/api/echo-mcp`。最新 Pages 发布 `bebf5028-0482-4102-b4db-3aa61a92f785`；前版 `0ecca06a-d4a1-41d1-aa88-529faa7dc109`，首次独立发布 `1bb62bf0-3904-4d8b-bc53-7f3f5b2e8d29`。两个 well-known 元数据和 MCP 工具发现均已在正式域名核对为 JSON；唯一工具 `read_english_learning`，唯一范围 `english:read`。

用户再次要求全项复查后，发现并修复异步授权异常捕获和旧身份连接码回退两个遗漏。当前重新验收、真实线上截图基线及未完成的活动通话门槛见 [本轮复查](../echo-independent-audit-20261014/verification.md)；下表保留首次独立版本的历史检查，不能用其覆盖新的验收结论。

| 实际检查 | 结果与证据范围 |
|---|---|
| TypeScript 与 Functions 类型检查 | 通过；无依赖或构建基础路径调整 |
| 独立 OAuth／读桥 Node 测试 | 30/30 通过；生产 handlers + 内存 SQLite，无公共网络访问 |
| 真实 workerd / D1 | 1/1 通过；按实际生产兼容日期 2026-09-01，阻断全部出站请求，无 Pocket 服务或数据库 |
| Chrome 当前内容／练习／音频／离线 | 桌面、手机两尺寸通过；隔离服务器，实际网页交互与新 OAuth / MCP |
| Chrome 独立授权页 | 两尺寸通过；浏览器自动识别原同步身份、点击同意、精确回调、PKCE 兑换；新版 per-plugin 回调，无真实平台授权 |
| 原同步／课程回归 | 82/82 通过 |
| Pocket 原接入回归 | 95/95 通过；移除英语扩展后的原模块 |
| 正式发布包 | 从原已上线 bbd15b60 叠加本任务文件构建，16,115 个资源；CSS 仍为原 `index-DODbSUpP.css`，不发布工作区原有课程／基础教程改动 |
| 原源文件保护 | 英语原同步 4 文件与开工前 SHA-256 一致；发布提取版仅有 Git 换行差异。Pocket 4 个接入文件恢复开工前原始字节 |
| 生产学习数据保护 | 首次独立发布前后 6 档案、12 分片一致；回调修正发布前后 7 档案、14 分片一致，多出的档案为本轮生成测试档案 |
| 真实独立云链路 | 6 项通过；生成的测试档案与受控客户端，经真实 Pages / D1 / OAuth / MCP；当前课程、草稿、未同步答案、同步更新、离页过期、撤销、全部原档案保护 |
| 真实私人插件及本人 OAuth | 已安装、已连接 Primary、30 天只读，刷新后 Read 1；独立复核 D1 primary 确认激活 |
| 原 Echo 实际独立读取 | 语音侧原 Echo 任务回传成功调用 `mcp__codex_apps__app_d694455fed68_read_english_learning(mode=both)`，06:51:56.354 UTC，内容过期时 `stale=true` |
| 原持久语音线程工具可达性 | 同一线程回传成功调用新工具，06:57:17.924 UTC，新上传上下文 `stale=false`；当时没有活动通话，不能称为通话中实测 |
| 本桌面独立工具库存 | 07:01:39 UTC 实际发现新 `app_d694455fed68` 的唯一读取工具，无 Pocket link 参数 |

本轮云端测试档案的专用 OAuth 授权已撤销，测试学习数据保留。它不是真人学习或原 Echo 的原生语音证据。浏览器报告位于 [当前内容报告](context-browser/report.json)、[授权页报告](oauth-browser/report.json)；原 Echo 及持久语音线程回传分别见 [独立工具读取回执](native-tool-reads.json)。云回执仅在忽略目录，未写入真实凭据。

Pocket 已于 05:02:58 UTC 恢复原生产模块，当前版本 `1390097a-3c35-4d12-9dbb-348ea509374f`；原部署模块 SHA-256 为 `33b834f4f9cc4e69c8ba4914307957b4bda85dd80386a3ad552097b46d61bcc5`。本次英语服务密钥已从 Pocket 移除，其他 secret 名称完全相同，健康状态 configured。05:52:08 UTC 核对旧 `companion-english-readonly` 文档已通过原仓库 CAS 协议退役，旧读取凭据移除；英语站的跨服务密钥也已移除。没有改写原 Pocket OAuth 或订阅记录。独立复核侧在恢复发布后报告原 2 个有效授权、3 个有效订阅的元数据摘要与发布前一致。

注册排查：ChatGPT 自定义插件实际返回 HTTP 400，具体为 `Dynamic client registration failed: registration endpoint returned 400 (invalid_client_metadata)`。其界面展示的回调为 `https://chatgpt.com/connector/oauth/<本插件标识>`，与原单一 `connector_platform_oauth_redirect` 不同。已按现场真实路径支持 ChatGPT 的插件回调格式，仍拒绝外域、userinfo、查询、fragment和其他路径；每个客户端保存并校验精确回调，PKCE 和范围不变。通过专用 Node 与 Chrome 回归后重新发布。插件采用英语服务自己新建的公开客户端，Token 身份验证为 none，依赖 PKCE；不复制 Pocket client、secret 或 bearer。

过程失败已保留：workerd 初次测试选用晚于本地运行时的兼容日期，改为核对的生产日期；SQL 测试拆分时遇到注释中的分号，仅修正测试脚本。授权浏览器回调 fixture 缺失 UTF-8 声明，实际已跳转但文字乱码，仅修正 fixture。旧凭据退役的管理 batch 初次未确认成功，先以 primary 只读核对未发生退役，再按已验证的原 CAS 管理适配器完成；没有盲目重复写入。

尚需完成：用户下次主动的正常通话中自然核对读取及网站练习后的更新，真实读取失败／未同步时的语音说明。本轮已结束的电话不能由工具可达性替代，未主动拨号、建立新 Echo 或要求重复授权。原 Pocket 桥曾收到语音侧工具调用成功回传，该结果只作取消架构的历史证据，不能替代独立入口验收。真实手机网页与 Android 未验证。

当前连接进展：ChatGPT 已完成自定义“英语学习”插件创建，插件 ID `plugin_asdk_app_6acf18cab44c819191011116e7df4a7d`。原 Echo 语音任务回传本人对当前具体 30 天只读授权回答“可以的”，随后在同一表单刷新后点击“允许只读连接”。实际返回 ChatGPT，管理页显示原账户已连接、Primary、OAuth、独立英语 MCP URL。已刷新工具，详情实际显示 Read 1，唯一工具 `read_english_learning`，无写入工具。截图保存在忽略目录 `real-english-oauth-connected.png`、`real-english-read-tool.png`，无凭据。独立复核侧以 D1 primary COUNT／时间投影确认已激活授权 1 个：06:50:11.526 UTC 激活，2026-11-13 06:50:03.006 UTC 到期；没有查询凭据值或学习身份。该连接及清单仍不等同原生通话验收。原 Pocket 工具清单已实际刷新并核对恢复 Write 9 / Read 7，不再含英语读取工具，两个原账户连接保留。

原生读取回传分别归档：原 Echo 在 06:51:56.354 UTC 调用新独立工具，`isError=false`、`status=connected`、`scope=english:read`，读取 `A1-01-03`“询问对方姓名”，`stage=study`，词句为 `What's your name?`、`My name is Ben.`、`My name is Mia.`。当时 `lastSeenAt` 对应先前上传，`stale=true`，不能冒充实时屏幕。刷新原英语网站后，后台实际上传同一学习页，没有开始或回答练习；桌面 D1 primary 只读投影确认同课、版本 96、同步对齐。原持久语音线程在 06:57:17.924 UTC 通过同一新工具读取成功，`lastSeenAt=2026-10-14T06:55:38.964Z`、`stale=false`；两次均 `source=last-uploaded-browser-context`、`progressAlignment=same-revision`、`selected=null`、`exercise=null`，原进度仍为版本 96、最后同步 2026-10-09 11:08:40.596 UTC。较新的是网页上下文，不是新增练习成绩。语音任务明确说明实时通话当时已结束，因此只记录原 Echo 的实际读取和持久语音线程工具可达性，不记录活动语音验收通过。
