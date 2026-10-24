# 词见改名记录

日期：2026-10-23。

## 已完成

- 实际项目目录迁至 `D:\vibe项目\词见`，包含原 Git、模型、音频、运行环境及未提交产物。
- 桌面保留「词见（本地）」「词见（在线）」两个入口；本地入口指向新目录，线上地址沿用原地址。根目录启动文件为 `启动词见.cmd`。
- 网页标题、README、项目指令、npm 工程名（`cijian`）、Android 工程及应用显示名、退出提示和麦克风权限提示统一改名。
- 保留原 `codewords-*` 学习记录键、同步接口、安卓包名 `com.codewords.english` 和既有签名。
- Windows 中的原目录被多个现有聊天的工具进程占用。文件迁移后，将空旧目录设为隐藏 Junction，目标为新目录；没有结束这些聊天或工具进程。
- Codex app-server 的现有项目已通过 `project/update` 改名并指向新目录；原项目 ID 保持不变。`config.toml` 的当前项目信任路径已更新。

## 验证

- `npx tsc --noEmit`：通过。
- `npm ls --all`：退出码 0，依赖未变；输出含平台及未启用功能的可选依赖缺项。
- `npm run build`：通过，16,571 个部署文件。
- `npm run verify`：通过；3,620 词，Aria/Guy 各 7,241 MP3，Piper 7,122 MP3，缺少项目文件和语音均为 0。
- `tools/test-local-launcher.ps1`：12 项断言通过，包含冷启动、并发启动、重复复用、音频、端口冲突和进程身份保护；结果保存于 `launcher-results.json`。
- Chrome 隔离上下文：1440px / 390px 两种宽度；标题为「词见」，可切换分区、刷新保留隔离上下文中的存储，未发现横向溢出或页面异常；截图已实际查看。未使用用户浏览器的真实学习记录。
- `node --test tools/test-native-android.mjs`：10 项通过。
- `scripts/Build-Android.ps1 -Validate`：Release、Debug 和 Android Lint 通过。
- `tools/verify_android.py`：最终 APK 的 16,569 个网页文件逐字节匹配 `dist`，包含 16,545 个 MP3；`apksigner verify --print-certs` 通过，保留原证书。应用标签通过 aapt 检查为「词见」。未安装到设备。
- 文件哈希核对：27,978 个无关受跟踪文件保持原样，原有 78 条未跟踪路径保留，Git HEAD 未变；详见 `migration-integrity.json`。

## 启动及打包修正

- Windows PowerShell 5.1 将无 charset 响应的中文标题解码错误，启动器改为明确按 UTF-8 解码页面后检查标题；内部探测统一使用 IPv4，用户访问地址仍为 `http://localhost:5186/`。
- 迁移后 Vite 冷启动会扫描历史验收页面和运行环境；依赖扫描限于 `index.html`，文件监听跳过运行环境、历史产物和原生工程。
- 六个原有日常语音 `.part` 临时文件仍留在源码原处，仅从生成的部署产物排除，使网页和 Android 的资源清单一致。

## 尚未完成

- Codex 正在运行的桌面项目列表仍显示旧名称与旧路径。直接修改持久化 `local-projects` 后，会被界面内存中的旧值恢复；底层 app-server 项目的新名称与新目录已持久化。当前工具没有更新桌面项目名称和根目录的入口，需要在现有项目菜单的「编辑项目」中将名称设为「词见」，目录选为 `D:\vibe项目\词见`。保留现有项目，不另建项目。
- 本轮未提交、推送、发布网站或修改远端仓库/域名，线上页面仍是原部署版本。

## 恢复资料

原快捷方式、当前指令及启动文件、Codex 配置和完整的改名前文件哈希，保存于 `%LOCALAPPDATA%\CodeWords-Local\rename-cijian-20261023`。原始 Codex 状态备份可能包含私有配置，只留在本机，不加入项目或提交。
