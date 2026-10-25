# 词见 Aa 图标验收

日期：2026-10-24。

## 设计与接入

- 按用户最新要求采用英语学习方向：Aa 字母与叠放的词卡，深蓝、暖白、琥珀色，不使用绿色。
- 最终原图通过内置 imagegen 生成，保存于 `design/cijian-icon/source.png`；完整提示词见同目录 `prompt.md`。
- `scripts/Build-IconAssets.ps1` 仅缩放和转换格式，生成 32/180/512px PNG、八尺寸 ICO，并同步安卓图标资源。
- 桌面「词见（本地）」「词见（在线）」已指向同一新 ICO。改动前的快捷方式与属性保存于 `.runtime/icon-redesign-20261024/shortcuts/`；原启动目标、参数和工作目录保持原样。
- 本地网页、Cloudflare 正式站、GitHub Pages 备用站的 favicon 和 Apple touch icon 已接入同一图案。安卓 Manifest 使用同源的 `cijian_icon.png`。

## 实际验证

- ICO 包含 16/24/32/48/64/96/128/256px 八个尺寸，各帧透明角正常。根 favicon 与桌面 ICO 字节一致，安卓 PNG 与网页 512px PNG 字节一致。
- Windows Shell 从两个实际 `.lnk` 提取的 32px 图标像素相同，均为新 Aa 图案；见 `shortcut-local.png`、`shortcut-online.png`。
- 通过 Chrome 实际查看 16/24/32/48/64px 与两种快捷方式图标预览，所有图像加载成功。截图见 `preview.png`；预览不是网站产品页面。
- 对最终 512px 图像做只读颜色检查：可见像素中饱和绿色像素为 0。没有使用程序重画或修改生成图的颜色。
- 本地网页返回三条新图标引用；自动化浏览器自身会叠加 favicon 标识，因此另核对原始服务器 HTML。
- `npm run build`、`npm run verify` 通过，部署文件 16,576 个；词汇、音频缺失均为 0。
- `node --test tools/test-native-android.mjs`：10 项通过。
- 安卓 Release、Debug、Lint 构建通过；APK 与 `dist` 的 16,574 个网页文件逐字节一致，签名验证通过，沿用原证书。aapt 确认应用图标为新的 PNG 资源。未安装到设备。

## 发布结果

- 提交 `faf9da16b88098ba977bdd0f21cb399b600c10dc`，已推送现有 `main`。
- Cloudflare 正式部署 `0d412630-9247-484a-8cd7-b22502e26275`，canonical deployment 为本次提交，状态 success。
- GitHub Pages workflow `40063094703`，状态 completed / success，关联同一提交。
- 已分别读取两个正式网址的 HTML；三条图标引用均为新文件。两站 32px、180px、512px PNG 及 ICO 的 SHA-256 均与本地原文件相同，详见 `online-assets.json`。
- 学习记录、课程、音频、同步格式、站点地址与快捷方式启动行为没有修改。
