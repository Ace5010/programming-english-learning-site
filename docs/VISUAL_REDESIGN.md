# 桌面视觉改版验收

日期：2026-09-15。直接修改现有 React / Vite 项目，本地仍使用 `http://localhost:5186/`。

## 参考与改动

实际查看了 Busuu 的[官方复习说明](https://help.busuu.com/hc/en-us/articles/16941990776593-How-can-I-review-my-vocabulary)、[词汇列表截图](https://help.busuu.com/hc/article_attachments/21019171643410)和[展开例句截图](https://help.busuu.com/hc/article_attachments/21020866054802)。两张图片均可访问，属于历史局部界面，未将其当作当前完整产品。

- 顶部横向导航取代原左侧栏；词汇改为连续列表，单词、释义和操作纵向对齐，例句直接可见并可点读。
- 桌面右侧集中呈现复习入口与真实学习进度；手机保留四项直接导航，将计数放在标签下方，避免长期使用后的大数字挤出页面。
- 词汇、设置、五类练习、纠错及结果页统一使用中性色、冰蓝选中状态、清晰字体和细边框；正确反馈使用绿色。
- 保留星标、掌握、拼写拆解等直接操作；播放态只由真实音频 `playing / pause / waiting / ended / error` 事件驱动。系统减少动态效果时停用动画和过渡。
- 保留原词汇、例句、音频、存储键与练习规则；未新增依赖，继续静态构建部署。

源码主要位于 `src/App.tsx`、`src/styles.css`、`src/Icon.tsx`、`src/ReviewLesson.tsx`、`src/LessonExercise.tsx` 和 `src/lesson.css`。

## 截图

[打开前后截图对照](../artifacts/busuu-redesign/index.html)：可切换 1440px、1920px 与手机 390px，查看词汇主页面、词库、练习、反馈和语音设置。

[新版桌面首屏](../artifacts/busuu-redesign/after/vocabulary-first-screen-1920x1080.png) · [配对](../artifacts/busuu-redesign/after/practice-pairs-1440.png) · [听写](../artifacts/busuu-redesign/after/practice-dictation-1440.png) · [总结](../artifacts/busuu-redesign/after/practice-summary-1440.png)

截图均来自真实 Chrome 页面。前后浏览页使用相同的空记录；练习使用相同的五个真实词汇测试记录。测试浏览器与用户真实记录隔离，截图统计不代表用户实际进度。词汇页保存整页，练习浮层保存视口；对照页保留并说明改版前整页截图的原始范围。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| 现有 review / spelling / lesson / lesson-exercise 测试 | 60 项通过 |
| `npm run build` | 通过，生成并检查 14,246 个部署文件 |
| `npm run verify` | 3,560 个词；Aria / Guy 各 7,121、Piper 7,122 段 MP3；缺失或损坏为 0 |
| 原有练习浏览器回归 | 12 个场景通过 |
| 更新后的词汇交互浏览器回归 | 8 个场景通过 |
| 新改版浏览器回归 | 7 个场景通过，16 次真实音频播放检查，无应用异常或音频资源错误 |
| 原始资产 SHA256 对比 | 21,365 个文件逐个一致，新增、缺失和改动均为 0 |

真实浏览器检查包括：单词与例句点读、请求等待时无假播放态、暂停/结束、双声线和语速切换、偏好记忆、收藏/掌握及刷新保留、搜索/分类/级别/分页、拼写拆解、五种练习、配对纠错、提示、暂时不会、听写错误与变式复查、完成整轮、结果保存、损坏记录保护、键盘焦点及减少动态效果。

检查 1440 / 1920px 桌面和 320–1024px 的手机、平板断点；另用掌握 1,200、收藏 3,200 的隔离记录检查中间宽度，修复了 320 / 431 / 761 / 768px 的导航溢出。新增完整轮测试实际完成 11 题，覆盖全部题型与一次隔题纠错复查，同轮纠正不会清除原困难记录。

构建仍提示包含完整词库的 JavaScript 包超过 500 kB，构建成功。本次未以拆分词库或更换技术栈扩展范围。浏览器媒体验证检查原生播放事件及时间推进，不等同于人工逐条试听全部录音；全部录音通过数量、存在性和哈希验证。

证据：[构建日志](../artifacts/busuu-redesign/checks/build.txt)、[完整性日志](../artifacts/busuu-redesign/checks/verify.txt)、[浏览器结果](../artifacts/busuu-redesign/after/redesign-results.json)、[资产一致性](../artifacts/busuu-redesign/asset-integrity.json)。

复跑浏览器测试时使用已有 Playwright，设置 `CODEWORDS_PLAYWRIGHT` 与 `CODEWORDS_TEST_URL=http://localhost:5186/`，依次运行 `tools/test-review-browser.mjs`、`tools/test-compact-cards.mjs`、`tools/test-redesign-browser.mjs`。测试只创建隔离上下文。
