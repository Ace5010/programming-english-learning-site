# 编程词卡精简验收

2026-10-04，当前工作区 `D:\vibe项目\Interactive learning`，沿用 `main`。

按用户要求移除词卡下方的用法说明、易混对比和重复的“例句”标签，只显示中文词义、英文、已有音标及一组双语例句。收紧卡片内边距、内部间距和卡片间距，保留原字号与正常／慢速点读。英文例句、录音、课程编排和存储逻辑未修改。

与本日上一轮居中版浏览器报告对比，蓝绿配色第一张词卡在 1440px 视口下由 458.58px 降至 313.39px（缩短 31.7%）；390px 视口下由 450.58px 降至 309.39px（缩短 31.3%）。桌面内容组仍居中，手机仍为一列。

实际验证：

- `npx tsc --noEmit`：通过。
- `node --test tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs`：27 项通过。
- `node tools/test-programming-word-check-browser.mjs`：19 个场景通过，覆盖四套配色、1440／390／320px 布局、两套声线真实播放事件、单词及例句正常／慢速点读、测试流程、刷新恢复和草稿续接。
- `node tools/test-mobile-browser.mjs`：13 个场景通过，无浏览器错误。
- `npm run build`：通过，已更新 `dist` 并完成构建资源核验；保留既有大 JS 文件提示。
- 本轮差异检查通过；`baseline/` 保存修改前的六个相关文件，包含此前未提交改动。

浏览器使用隔离 Chrome 上下文和已核实属于当前工作区的 `http://127.0.0.1:5186/` 开发服务。以上是浏览器与手机视口仿真验证，不代表 Android 真机或线上部署验证。未提交、推送或发布。

截图及详细结果见 `browser/report.json`、`browser/learning-lagoon-1440.png`、`browser/learning-lagoon-390.png` 和 `mobile/browser-results.json`。先前验收记录保留，其带用法说明的旧词卡截图不再代表当前界面。
