# 完成提示音修复（2026-10-29）

用户报告：电脑浏览器的课末或词汇复习完成音间歇失效。

已确认的问题：AudioPlayback 收到外部 pause 事件会静默 stop；FeedbackAudio 原有一次重试只覆盖 error/超时，因此完成音在播放开始即被暂停时不恢复。通过真实 Chrome Audio 元素注入一次 pause，编程、日常和词汇复习三个完成入口均在修复前失败；正常路径三项通过。此注入复现说明代码缺口，用户现场的暂停来源尚未确认。

修改：仅完成提示音开启意外暂停恢复，转入原有一次重试。主动停止先移除事件处理器，不触发重试；正常 ended 不当作异常。持续中断不循环，静音、导航和新点读继续取消。

验证：

- `npx tsc --noEmit`：通过。
- `node --test tools/test-audio-playback.mjs`：19/19 通过。
- `node --test --test-name-pattern='feedback|completion|answer cues|expired cue|normal media end|external completion pause|navigation, muting' tools/test-reading-feedback.mjs`：8/8 通过。
- `node tools/test-completion-audio-browser.mjs`：6/6 通过，三种完成入口各覆盖正常播放和一次意外暂停，等待实际 MP3 ended，并核对完成状态持久化及刷新不重播。使用隔离浏览器和测试记录，没有访问用户学习记录。见 results.json。
- `npm run build`：通过，部署资源检查 16,582 文件通过，dist 已重新构建。
- 完整 `tools/test-reading-feedback.mjs` 的首项录音清单与当前内容不一致，失败发生在 inventory 深度比较，与提示音播放逻辑无关；未改录音、清单或课程内容。旧浏览器测试亦有早期课程夹具不适用当前编程流程的问题，未据其报告通过。

未提交、推送或发布。工作区同时存在其他来源的课程及样式修改，本次未覆盖或归入提示音修复。
