# 词见 A＋书页图标验收

- 采用用户选定的第一版原图，主图 SHA-256：a8577fe795ae7d404ae718b6ff4522f223a0a6907581a110fda9d34bfb97bbf6。
- 桌面「词见（本地）」「词见（在线）」快捷方式已更新，目标、参数和工作目录保留；旧快捷方式与原图备份在私有 .runtime 目录。两个 shortcut-*.png 为 Windows Shell 实际提取的图标，preview-desktop.png 为 Chrome 渲染截图。
- 网页 ICO 提供 16/24/32/48/64/96/128/256 像素；网页 PNG 提供 32/180/192/512 像素，包含 iOS touch icon 与 Android 浏览器主页图标清单。
- npm run build、npm run verify 通过；词汇及音频检查无缺失。node --test tools/test-native-android.mjs：10/10 通过。
- Build-Android.ps1 -Validate 完成 Release、Debug、lintRelease；Lint 无错误，保留原有未使用资源警告。APK 签名与旧包一致，包内资源验证见 apk-validation.json。
- 实体安卓手机已以 adb install -r 覆盖升级到 1.1.4（versionCode 6）。安装后 APK 哈希与候选包一致，图标像素与所选图一致，首次安装时间及应用数据目录 inode 保留，见 phone-update.json。本轮未操作课程或执行发音识别。
- Cloudflare 和 GitHub Pages 两个线上站点各 7 个图标／清单资源与本地逐字节一致，见 online-assets.json。发布状态与提交号见 deployment-status.json。
