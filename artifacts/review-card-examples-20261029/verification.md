# 复习库多列卡片与例句验收

- 宽屏三列（1280px 起），中等宽度两列（640px 起），手机单列。
- 每张卡片直接显示中英例句，保留单词及例句的正常/慢速点读、收藏和单词练习。
- 每页 12 个词，支持前后翻页和直接跳页；搜索及范围切换返回第一页。
- 类型检查 `npx tsc --noEmit` 通过。
- 专项 `node tools/test-review-compact-browser.mjs` 通过：五个宽度、四套配色共 20 组明确检查列数、所有例句可见、无横向溢出；分页、搜索、筛选、真实播放事件及 0.72/1 倍速、收藏、记录保持、练习入口均通过。
- 手机回归 `CODEWORDS_SCENARIO=phone pages`、`node tools/test-mobile-browser.mjs` 通过（独立输出目录）。
- 已查看桌面、平板和手机的实际渲染截图。
- 构建 `npx vite build --emptyOutDir false` 与 `node scripts/prepare-deploy.mjs` 通过；保留 dist 现有资源以避开原 audio 目录清理权限问题。
- 使用隔离浏览器上下文和测试进度；学习规则、数据格式及音频文本未修改。
