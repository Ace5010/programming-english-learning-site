# Echo 英语桥撤回记录

2026-10-17。按用户取消方案的要求撤回，不再推进 Echo 英语桥或原语音验收。

## 已撤回

- 英语网站正式域名恢复桥接前的既有发布 `65ff6a70-6330-46bb-8bbf-68d4ee7c1a29`，对应源码 `bbd15b60170fdd12eaee10ab78f36e63dc8f6e84`。线上 JS 与 CSS 的 SHA-256 均与原发布完全相同。
- 独立“英语学习”插件已卸载／解除连接；ChatGPT 设置页显示“关联”，不再显示原授权账户。原 Echo、Pocket 及其他插件未改动。
- 英语桥全部读取授权撤销，访问与刷新令牌、授权码、一次性码及旧桥授权均过期；启用的桥状态、有效 OAuth 授权与有效令牌均为零。停用记录保留，不删除原学习数据。
- 本地启动、页面上报、点读上报、同步设置中的 Echo 项、构建步骤、路由和 CSP 扩展已撤回。27 个桥专用源码、服务、脚本、测试和活动说明文件移至忽略目录 `.runtime/echo-removal-20261017/retired-source/`，供恢复历史使用。
- 活动 Functions 只剩原 `/api/sync`。线上 Echo 和 OAuth 路径回到原静态站的 HTML fallback，已不提供 JSON／MCP 读取服务。

## 数据与已有工作

- 回退前后原同步数据库 8 份档案、16 段记录的完整有序内容指纹一致。同步库绑定保留，没有写入或删除学习档案、成绩、掌握状态或答案草稿。
- 原同步协议、客户端、合并和云端同步处理器的文件字节与原快照一致；其他受影响页面源码恢复原版本，差异仅有文件换行形式。
- 12 个与桥接无关的已有修改经逐文件 SHA-256 核对保持原样。本轮没有创建分支、提交或推送。
- 用户原浏览器刷新后仍为日常第 2 节“询问来源”，已完成 1 题，当前题仍为 “Are you from Japan?”，未替用户作答。原同步仍显示“进度已同步”。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | 通过，原音频与资源校验通过；本机构建保留未发布的其他已有修改，未用于覆盖正式站 |
| `node --test tools/test-progress-sync.mjs tools/test-course-upgrade-sync.mjs tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs tools/test-daily-content.mjs tools/test-daily-progress.mjs` | 81/81，通过 |
| `node tools/test-sync-browser.mjs` | 8/8 隔离 Chrome／SQLite 场景通过，页面错误 0；覆盖配对、离线恢复、收藏同步、刷新、冲突备份和断开后保留记录 |
| 页面检查 | 原用户浏览器正式站同步窗口正常；320/360/412/844px、四种配色通过原同步浏览器检查，并查看实际截图 |
| 正式资源与服务 | JS/CSS 原文件哈希一致；原同步返回正常鉴权响应；Pocket 健康为 configured；桥路由已停用 |
| `git diff --check` | 通过 |

证据：[本地恢复](local-receipt.json)、[生产资源与路由](production-receipt.json)、[云端回退与数据保护](cloud-receipt.json)、[隔离浏览器](sync-browser/results.json)、[原同步界面](production-sync.png)、[插件解除连接](plugin-disconnected.png)。
