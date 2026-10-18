# 日常英语可选跟读验收

日期：2026-10-18。

按用户最后确认：原题库、题面、动态题量和原 20 项上限保持不变，不改成固定 10 题。日常英语口语步骤提供“跟读练习（可选）”；直接点“继续”即可前进，不要求录音、填写表达或勾选自查。原有正常／慢速示范和自愿麦克风练习保留。

## 实现与记录保护

- `DailyEnglish.tsx` 只对日常存储键启用可选流程，跳过或完成后在一次保存中进入下一题／结果页。语音正在启动、录音或处理中仍可继续，组件离开时中止识别并屏蔽迟到回调。
- `DailySpeaking.tsx` 默认收起可选跟读，展开后才初始化识别；旧草稿有内容时展开恢复，旧自由表达文字可以查看。新流程不再显示“自己表达”、自查复选框或手改识别文字入口。
- `dailyProgress.ts` 沿用现有的完成记录与 `speech.source: skipped`，没有修改存储版本、键名、解析规则或迁移数据。未完成练习不增加错误、口语成功或掌握证据。
- `dailyCourse.ts`、`dailyPractice.ts`、`adaptiveLearning.ts`、`learningTypes.ts`、`speechComparison.ts` 无改动；题库、题量、编排、判断及旧记录定义保持原样。
- 用隔离测试数据检查旧草稿、历史课程记录、收藏、刷新恢复、其他分区存储和重复提交保护。未读取或写入用户浏览器档案中的学习记录。
- 对开始时已有修改的其他文件进行了 SHA-256 对比，未被本次改动覆盖。没有创建分支、提交、推送或发布。

## 已执行检查

- `npx tsc --noEmit`：通过，见 `typecheck.log`。
- `npm run build`：通过，重新生成 `dist`；构建内资源验证通过，见 `build.log`。
- `node --test tools/test-daily-optional-speaking.mjs tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs tools/test-daily-content.mjs tools/test-daily-progress.mjs tools/test-adaptive-learning.mjs tools/test-daily-practice.mjs tools/test-programming-practice.mjs tools/test-programming-review.mjs tools/test-programming-word-check.mjs tools/test-word-learning.mjs`：118 项通过，见 `node-tests.log`。
- `node --test tools/test-daily-speech-state.mjs tools/test-course-upgrade-sync.mjs`：18 项通过，见 `speech-sync-tests.log`。
- `tools/test-daily-optional-speaking-browser.mjs`：13 场景通过、0 页面异常；覆盖直接继续、旧自查草稿、识别成功及刷新、三次不匹配、不支持识别、权限／网络／语言异常、启动／录音／处理时退出及迟到结果、末题结课、四配色与桌面／手机。见 `browser/report.json`。
- `tools/test-mobile-browser.mjs`：13 场景通过，见 `mobile.log`；最后配色修正后重跑受影响的日常跟读手机场景，见 `final-mobile.log`。
- `tools/test-programming-word-check-browser.mjs`：19 场景通过，见 `programming.log`。
- 最后样式修正后重新构建，重跑四配色及 1440／390／320px 检查，共 18 张展开／收起截图，无横向溢出，见 `final-layout/report.json`。人工查看桌面、390px 收起／展开和 320px 展开效果，删去重复提示，并修正麦克风按钮文字对比度。
- `git diff --check`：通过。

浏览器使用独立 Chrome 上下文和测试学习记录。语音识别使用模拟回调验证交互、取消和保存；正常与 0.72 倍慢速示范使用真实本地 MP3 播放事件验证。未执行真人麦克风纠音评测或安卓真机测试。

## 首次检查中的问题

- 修改前的浏览器复现启动使用默认 `load` 等待，`page.goto` 在 30000ms 超时，未生成该次预期截图。之后使用已构建的 `/dist/` 页面、`domcontentloaded` 和本地无代理 Chrome 完成验收。
- 首次新浏览器测试的前两项通过，音频检查在 15000ms 超时：测试把 `playing` 监听放在 `document`，而播放器使用未挂入 DOM 的 `Audio` 对象。测试改为在实际音频元素上监听事件，保留原生 `play()`；正常／慢速真实播放随后通过。失败截图保留为 `browser/voluntary-recognition-and-real-normal-slow-audio-failed.png`。

## 交付位置

本地源码和 `dist` 已更新，线上发布未执行。预览和测试使用本项目原端口 5186；未更改端口、Vite 配置、部署基础路径或音频文件。
