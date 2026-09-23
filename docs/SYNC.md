# 手机与网页进度同步

2026-09-23。实际学习站点为 https://programming-english-learning-site.pages.dev/ 。Android 1.1.0 使用同一同步接口，仍保留完整离线资源与原有学习记录。

## 使用

1. 在原来有学习进度的网页刷新一次，点击顶部“同步”→“开启同步”。等待“进度已同步”，再复制同步码。
2. 安装 Android 1.1.0，在“同步”中粘贴这个码，点击“连接已有进度”。无需注册账号。
3. 之后学习变更会自动上传；页面回到前台、恢复联网、以及前台定期检查时拉取另一设备的更新。也可点击“立即同步”。后台或断网时不保证即时传输，但本机答题继续保存。

同步范围包括旧的已掌握词、编程课程、词汇复习、练习统计、收藏和日常英语的课程、复习与收藏。两区原本的存储键及词汇 ID 相互独立。主题、声音、语速和当前导航保留为本机偏好。

同步码是 256 位随机私人凭证。持有人能读写对应进度，请仅在自己的设备间传递。云端只存凭证的 SHA-256 哈希，不提供按姓名查询或账号找回。网页、安装包和 Git 中没有预置的用户同步码。未开启同步的设备继续只在本机保存，朋友不会自动加入你的记录。

## 保留记录与冲突

- 先保存本机，再同步。网络错误、服务繁忙或配额错误不会清空本机记录。
- 每次上传使用服务器版本号比较；过期版本不能覆盖新版本，上传响应丢失后重新读取确认。
- 独立的日常／编程变更可以合并。词汇收藏按照上一次共享记录合并新增和取消。编程课程、掌握标记、词级复习与统计作为关联记录一起处理，不把两份答题次数相加冒充掌握证据。
- 两台设备同时修改同一区域会显示冲突。选择继续哪份前，将两份存入本机最近一次冲突备份，可从同步面板导出 JSON；不冲突部分仍合并。再次解决冲突会替换这份“最近一次”备份，重要记录可先导出。
- 正在输入、使用语音、进行词汇复习，或页面有未保存的课程记录时，暂缓应用远端变更。损坏或未知版本记录不会被迁移为空记录。
- 应用远端记录有恢复日志；多键写入失败时回滚，避免只写入课程而没写入相应复习记录。本机存储容量不足会停止同步并显示错误。
- 断开同步只断开本机连接，保留本机和云端记录。安装升级须保留包名和签名，不能先卸载再安装来保留原本机记录。

## 实现与部署

前端复用原 `localStorage` 格式，增加 `codewords-sync-v1`（配对和共享基线）、`codewords-sync-journal-v1`（短暂恢复日志）与 `codewords-sync-backup-v1`（最近冲突备份）。不将这些凭证或备份放进自动同步载荷。

- `src/progressStorage.ts` 只通知成功的学习记录写入；不修改浏览器全局 Storage 原型。
- `src/progressSync.ts` 完成同步协议、三方比较、冲突和回滚；`syncValidation.ts` 复用现有课程与复习校验器。
- `src/SyncPanel.tsx` 提供配对、状态、冲突选择与导出；手机和四种风格共用。
- `functions/api/sync.ts` 是 Pages Function，绑定 `CODEWORDS_SYNC_DB`；`cloudflare/sync-schema.sql` 定义表与索引。
- `wrangler.jsonc` 绑定专用 `codewords-progress-sync` D1 数据库。预览环境不绑定正式数据库。Git 主分支提交由现有 Cloudflare Pages 集成部署；GitHub Pages 仍是静态前端，访问指定的 Cloudflare 同步接口。
- `public/_routes.json` 只将 `/api/sync` 交给 Function，音频继续走静态资源。CORS 只允许正式网站、GitHub Pages 的本站 origin 和 Android 本地 HTTPS origin；本地开发数据不会默认接入正式云端。
- API 用 Authorization 请求头传同步码，响应禁止缓存，不把凭证放进 URL、错误信息或应用日志。SQL 参数绑定；写入及分片在同一 D1 批次中比较版本，保留当前及前一版本。载荷上限 8 MiB，新增同步空间有来源及每日总量限制。
- Android 仅开放指定 HTTPS 同步路径；所有课程、点读继续使用包内资源。前端无新增 npm 依赖；本地 Function 编译检查使用 Wrangler CLI，不打包进 APK。

新部署先创建 D1 数据库，执行 schema，再配置真实数据库 ID 并推送。当前数据库表已通过仪表板执行和查询核对。不要把管理令牌或真实用户同步码提交到仓库。

官方配置参考：[Pages 的 D1 绑定](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases)、[D1 批次事务](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)、[Pages Wrangler 配置](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。

## 验证

```powershell
npx tsc --noEmit
node --test tools/test-progress-sync.mjs
node --test tools/test-daily-content.mjs tools/test-daily-progress.mjs tools/test-adaptive-learning.mjs tools/test-native-android.mjs
npm run build
npx --yes wrangler@4.136.3 pages functions build --outdir .runtime/sync-functions
node tools/test-sync-browser.mjs
node tools/test-mobile-browser.mjs
node tools/test-android-web-bundle.mjs
```

`test-progress-sync` 使用隔离 SQLite 执行生产 Function 的 SQL，验证并发版本保护、超大请求、来源／凭证限制、分片、离线恢复、冲突和回滚。浏览器测试使用隔离 Chrome 数据，模拟网页和 APK origin；原生安装、系统语音与文件选择器仍须真机确认。

上线后设置 `CODEWORDS_LIVE_SYNC=1` 运行 `test-sync-browser.mjs`，使用临时随机同步码和测试夹具连接真实 D1；只模拟手机包内资源，不读取用户自己的浏览器记录。结果记录在 `artifacts/sync-audit/`。测试结果以实际生成报告为准，不能将本地模拟当成线上成功。
