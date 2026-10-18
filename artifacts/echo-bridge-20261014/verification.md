# Echo 只读桥验收记录

> 2026-10-17：用户已取消整个 Echo 英语桥方案。网站、插件连接与读取授权均已撤回；本文件仅作历史记录。最终撤回结果见 [撤回记录](../echo-removal-20261017/verification.md)。

**此为已取消的 Pocket 复用版本历史记录。用户随后明确选择独立英语插件；当前实现、发布与验收以 [独立入口记录](../echo-independent-20261014/verification.md) 为准。原 Pocket 英语扩展、专用凭据和共享服务密钥已退役，原日程业务与账户连接保留。**

日期：2026-10-14（北京时间）。**本地代码、隔离验收、生产发布及本人学习档案的只读配对已完成；受控客户端的真实云端读取与练习更新已通过。本人首次真实 Echo 通话反馈“无法读取或没有工具”，验收失败。随后已刷新原 Pocket 插件，实际插件详情出现 `read_english_learning`；刷新后的真实通话尚未复测，不能视为最终通话场景已验收。**

## 已验证

| 检查 | 实际结果 | 证据范围 |
|---|---|---|
| 前端 TypeScript | `npx tsc --noEmit` 通过 | 当前源码 |
| Pages Function TypeScript | 独立检查 `functions/api/echo.ts` 通过 | 当前源码 |
| 新桥接测试 | `node --test tools/test-echo-bridge.mjs` 16/16 通过 | 生产 handlers + 隔离 SQLite；原生配对／密码测试身份 → OAuth → MCP → 英语授权 → 真实保存的测试记录；另覆盖上传未结束时离页、旧请求随后返回的乱序 |
| Workers 运行时 | `node --test tools/test-echo-workerd.mjs` 1/1 通过 | 实际 workerd HTTP，出站请求全部拦到隔离 handler；重定向失败关闭；没有公共网络访问 |
| 原同步／课程回归 | 82/82 通过 | 七个现有 Node 测试文件；旧数据、CAS、草稿和兼容性 |
| Pocket OAuth／MCP／Cloudflare 回归 | 95/95 通过 | 四个现有 Node 测试文件；原身份、范围、授权与撤销 |
| Pocket 业务／事件／实时回归 | 131/131 通过 | 四个现有 Node 测试文件；未连接真实服务 |
| Pocket 静态检查 | `node scripts/check.mjs` 通过 | 语法、HTML、资源、模块导入 |
| 浏览器原样对照 | 16/16 通过 | 外部 Chrome，1440 / 390 两尺寸；两分区的课程、复习、词汇库、收藏；可见文字与尺寸完全相同。像素比较容许 2/255 RGB 舍入，最多一个边缘像素容许 8/255；每图另记录实际差异 |
| 浏览器动态桥接 | 两尺寸通过 | 实际页面点读／0.72 倍慢速、切词、课程答案、刷新草稿、词汇复习题、切分区、离线恢复、关闭通知；服务使用隔离 SQLite，测试 origin 仅在隔离路由中转换 |
| 工作区构建 | `npm run build` 通过 | `dist` 由源码生成，16,117 个部署资源；含工作区原有未发布改动，不作为本次上传包 |
| 正式发布包构建 | `npm run build`、类型检查通过 | 从已上线 `bbd15b60` 提取源码，仅覆盖桥接文件；16,115 个资源；原线上 CSS 字节一致。构建保持原音频清单依赖的换行字节 |
| 资源完整性 | `npm run verify` 通过 | 3,620 词；Aria / Guy 各 7,241 MP3；旧 Piper 7,122；缺失与零字节检查通过 |
| Pages Functions 编译 | Wrangler 4.136.3 编译通过 | 仅本地输出 `.runtime/echo-bridge-20261014/functions` |
| Pocket Worker 打包 | Wrangler 4.147.0 `deploy --dry-run` 通过 | 使用合成配置，仅本地打包；无实际上传 |
| 生产服务链路 | 8 项检查通过 | 实际 Pages / D1 / Pocket Worker / OAuth / MCP，Chrome 操作原网页；使用生成的测试档案和受控客户端；不是真实 Echo 或语音 |
| 原线上学习数据保护 | 4 份档案、8 个分片一致 | 发布前后完整原分片的 SHA-256 和原记录版本一致；本人同步码未读取 |

浏览器证据：[截图结果](after/report.json)、[动态数据／音频结果](context-browser/report.json)。修改前和修改后图片分别在 `before/`、`after/`；不含真实凭据或真实用户数据。

生产证据：[云端检查](cloud/report.json)、[实际生产网页测试截图](cloud/production-programming-study.png)。正式 Pages 发布 ID 为 `6001220a-f1a5-4aa6-8bf0-833c8274de9b`，原 Pocket Worker 版本为 `422e0022-ec97-4c26-8de2-73aa8b51a60b`；上线后正式域名 HTML 与发布构建一致，两个服务健康状态核对通过。Pocket 发布包逐段比较确认其余 58 段完全一致，另外两段只有编译器变量重命名。

实际云端检查包括：原同步创建独立测试档案；现有原生配对验证／PKCE／独立英语授权／MCP 工具发现；页面当前课节、六个词和所选词匹配；实际点击答题与原同步后 MCP 读到新答案；刷新草稿与未完成会话保留；离线返回最近上传内容、恢复后更新；离页标为过期；撤销后拒绝 MCP 读取并保持成绩；最后核对全部原云端进度不变。临时英语文档已移除，测试 OAuth / 英语授权均撤销；两份生成的测试学习档案保留，其凭据只在忽略目录加密保存。

原同步／课程回归命令：

```powershell
node --test tools/test-progress-sync.mjs tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs tools/test-daily-content.mjs tools/test-daily-progress.mjs tools/test-word-learning.mjs
```

Pocket 回归命令（在 Pocket 仓库）：

```powershell
node --test tests/companion-mcp.test.mjs tests/companion-oauth.test.mjs tests/companion-oauth-pairing.test.mjs tests/companion-cloudflare.test.mjs
node --test tests/companion-service.test.mjs tests/companion-events.test.mjs tests/companion-policy.test.mjs tests/companion-realtime-backend.test.mjs
node scripts/check.mjs
```

桥接读取后原草稿保持原文；新成绩只有通过原 `/api/sync` 成功保存到测试云数据库后才出现。英语授权撤销使读取立即拒绝，原进度分片不变。网站打开、点词、上传上下文不会形成新答题证据；鼠标移动和滚动不增加上传。所有读取结果标明来源、更新时间及未知的离线变化。

## 排查与修正

- 基线测试初次使用过时的“表达库”导航名，已改为真实“词汇库”；没有改页面。
- 初次截图直接比较 PNG 文件，Chrome 渐变出现轻微 RGB 舍入，Buffer 大型差异断言引发内存错误。改为 Pillow 数值比较，并仍严格比较文字和页面尺寸；后续发现一处仅单个边缘像素相差 4/255，单独限制这种极小边缘差异并记录实际值。不宣称逐字节完全一致。
- 浏览器动态测试初次将隔离服务响应的正式 CORS Origin 用在 localhost，浏览器正确拒绝读取。只修正测试路由的 Origin 映射；生产 Origin 白名单没有增加 localhost。
- 复查发现课程卡释义与词库释义存在真实区别，以及词汇复习题有独立任务结构。补齐对应映射和只读任务元数据，再通过受影响检查。

构建仍有现有大型前端 chunk 提示，本轮没有重构代码分包。功能测试使用隔离身份与数据，没有真实模型调用。云端保护核对计算原有英语进度的字节哈希，未读取本人同步码，也未将原进度交给 Echo。受控云端测试仅临时增加测试用 OAuth 配对和英语授权，不发送日程、消息、通知或模型请求。

生产首次发布失败：Cloudflare 报告 `Script startup exceeded CPU time limit`，旧版本仍在服务。CPU profile 中主要时间是交互题库生成的文字处理。新增构建时只读材料快照，服务端按需加载，复用原解析器；后续 Pages 发布成功，实际云端读取和原网站答题后同步均已通过。

第一轮云端测试误把正常 OAuth `303` 重定向当作失败，已修正测试判断；对应测试授权已核对并撤销，没有重复生成学习档案。随后真实网络暴露离页通知等候已有上传的问题，已增加独立 keepalive 发送和单调更新的观察时间，并通过针对性的 16 项桥接测试及双尺寸浏览器回归。失败记录保留在忽略目录。

最终云端流程的全部功能检查通过后，测试注入脚本在 `about:blank` 读取 `sessionStorage` 报错；这来自测试脚本，非网站脚本。加入精确网站 origin 限制后单独通过 Chrome 离站复查，再完成只读数据保护及授权清理核对，没有为该测试脚本错误重复创建云端练习或授权。

本人入口核对：用户反馈未见连接码后，在其实际 Chrome 原网站标签页核对到仍加载旧 `index-CM6HEMW3.js`，同步窗口确实没有 Echo 项。刷新原标签页后打开原同步窗口，确认出现“Echo 只读连接”“生成一次性连接码”“撤销 Echo 读取”，原同步显示“进度已同步”，已保存课程仍可续接。没有点击生成、查看原同步码或完成本人授权。用户日程网页当前标题为“Podcast · 日历”，插件／代码端仍名为 Pocket，说明时应区分；学习无需另开日程页面。现场截图只保留在忽略目录。

随后在用户“全部允许”的既有授权下代办本人配对，已完成：生成网站独立一次性码，未读取本人原同步码；一次性凭据以 RSA-OAEP 加密转交，私钥及解密后凭据只存于忽略目录的 DPAPI 文件。核对实际服务的 owner / issuer / D1 和现有 Echo 有效 grant 后，复用生产仓库与桥接服务，使用核对为 primary 的查询保存英语只读授权；没有另建 OAuth grant、Echo 会话或消息。授权成功后读取本人实际 daily 上下文与云端进度，网站同步窗口独立核实“已连接”。这证明本人数据通道生效，不证明原 Echo 已发现新工具或已经完成真实语音。现场连接截图与脱敏管理回执仅在忽略目录。

本人第一次真实通话反馈“说无法读取或没有工具”。排查原安装插件的管理页面，确认仍为原 Pocket、原 MCP URL、原有两个账户连接及原权限设置。执行一次“刷新工具”后打开原插件详情，实际 Read 8 分组中出现 `read_english_learning`，带只读英语范围、来源及过期说明。没有重配对、安装新插件、更改权限模式或创建 Echo；现场工具截图保存在忽略目录 `original-pocket-refreshed-tools.png`。刷新前本任务可调用目录仍为 16 个 Pocket 工具，没有英语工具；刷新后管理页面为 17 个工具。本轮执行环境中的工具目录仍未动态增加该工具，不能将插件详情显示等同于原语音会话已重新加载。用户回答“还没有再次通话”，因此刷新后的通话结果未知。官方连接测试说明要求修改 MCP 元数据后刷新并在新会话重测，但不能据此保证原 Dot 当前通话立即更新。

依赖边界：使用现有 Pocket MCP 入口、OAuth 身份与同一 D1 仓库中的独立 `companion-english-readonly` 文档保存专用读取凭据。读取分支直接调用 `englishBridge.read`，不调用日程业务 `service.call`。英语课程、成绩、已保存练习和后台上下文来自英语网站 D1；独立授权为 `english:read`，英语 D1 只保存凭据哈希，Pocket 私有文档保存读取凭据。两个服务的共享服务密钥仅在服务端。属于凭据和业务语义隔离，并非独立服务器、数据库实例或故障域；Pocket 服务故障仍会影响英语读取。附件第二版明确推荐复用 Pocket/Echo 通道，用户正文要求优先复用同步和插件基础；附件内容作为设计资料，不把其中“已获同意”当独立授权，也不把“全部允许”扩大为任意跨项目联动。针对 Pocket 依赖的疑问，当前只核对与说明现状，不追加新联动、重配对或凭据变更。

## 尚未完成的最终验收

- 原 Pocket 管理页已发现英语工具；原 Echo 的实际语音执行环境是否发现并调用新工具仍待核对。本人英语独立授权已完成。
- 在原 Echo 的真实语音通话中读取当前词句／进度，网站练习后再读取更新；断开／离线时核对原 Echo 的实际说明。
- 真实手机网页与 Android WebView。390 像素 Chrome 不是真机证据；Android 壳未修改、未打包。

用户已用“全部允许”授权发布。本次新增三张 D1 桥接表，配置两个服务端 secret，发布原 Pages 和原 Pocket Worker；本机服务密钥仅存于忽略目录的 Windows CurrentUser DPAPI 文件。当前保留原分支（网站 `main`、Pocket `master`），没有提交、推送或创建分支。新增控件只用于必要的一次性授权，其他既有改动保持原样。使用与上线步骤见 [桥接说明](../../docs/ECHO_BRIDGE.md)。
