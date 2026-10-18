# 编程课程音标补全验收

2026-10-05，工作区 `D:\vibe项目\Interactive learning`，沿用 `main`。

课程的 63 个目标词原有五项 `phonetic` 为空，词卡按原规则省略空音标，因此出现有些词显示、有些词不显示。将这五项补入 `scripts/vocabulary-expansion.json`，通过 `scripts/build-vocabulary.mjs` 生成并验证候选词库后更新 `src/vocabulary.ts`。课程与词汇库读取相同数据，不需要另加显示规则。

| ID | 词语 | 显示音标 | 核对来源 |
| --- | --- | --- | --- |
| 7 | pull request | /pʊl rɪˈkwest/ | Cambridge [pull](https://dictionary.cambridge.org/pronunciation/english/pull)、[request](https://dictionary.cambridge.org/us/pronunciation/english/request) |
| 11 | checkout | /ˈtʃek.aʊt/ | [Cambridge checkout](https://dictionary.cambridge.org/us/pronunciation/english/checkout) |
| 20 | readme | /ˈriːdˌmiː/ | [Collins readme](https://www.collinsdictionary.com/us/dictionary/english/readme) |
| 687 | message | /ˈmes.ɪdʒ/ | [Cambridge message](https://dictionary.cambridge.org/us/pronunciation/english/message) |
| 1880 | main | /meɪn/ | [Cambridge main](https://dictionary.cambridge.org/us/pronunciation/english/main) |

`pull request` 按两个词的词典音标组合，未声称词典提供整条短语的固定重音。`main` 使用“主要的”这一小写词条，非同名河流。`readme` 使用 Collins 词条所列音标。源数据不存外围斜线，沿用现有组件统一显示。

完整比较更新前后 3,620 个词条，只有上述五项的 `phonetic` 字段变化；其余字段、词条顺序和全部 ID 完全相同。英文文本及所有录音未改动，无需重生成音频。当前 63 个课程词全部有音标，全量词库仍有 1,136 项缺失，本轮未扩展至这些课程外词条。

实际检查：

- `npx tsc --noEmit`：通过。
- `node --test tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs`：27 项通过，0 项失败。
- `npm run verify`：通过，词汇 3,620 项，Aria／Guy 各 7,241 个 MP3，Piper 7,122 个；无缺失及零字节文件。
- `npm run build`：通过，更新本地 `dist`，资源核验通过。保留既有大 JS 文件提示。
- `node tools/test-programming-word-check-browser.mjs`：对本轮生产构建运行，19 个场景通过，0 项失败。覆盖四套配色、1440／390／320px 布局、原正常与慢速点读、课程流程、刷新与草稿恢复；现有布局场景新增首节六张卡都有音标的断言。结果见 `production/report.json`。
- 补充隔离浏览器检查：1440px 和 390px 各遍历 11 轮预览，共检查全部 63 个不同课程词的音标文本；再逐一搜索五个补齐词，验证词汇库音标一致。两种视口均无页面错误，见 `all-course-and-library.json`。
- 人工查看生产构建手机截图，音标与慢速按钮清楚显示，原紧凑词卡布局保持正常。

首次开发服务浏览器运行在 `page.goto` 阶段超过 10 秒启动等待，未完成场景；开发服务随后可正常响应。生产构建完成后重新运行上述完整浏览器检查并通过。未把首次失败计为通过，也未更改测试超时来掩盖该失败。

浏览器使用隔离 Chrome 上下文和当前工作区的 `http://127.0.0.1:5186/dist/`，遍历所用跳过操作仅写隔离测试数据，不操作用户学习记录。以上为本机浏览器及手机视口仿真，未进行 Android 真机或线上部署验收。本轮未提交、推送或发布。
