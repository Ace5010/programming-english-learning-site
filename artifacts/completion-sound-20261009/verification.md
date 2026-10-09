# 课程完成提示音修复验收（2026-10-09）

## 范围与结果

用户确认问题发生在电脑浏览器，表现为课程结束时的提示音有时不响。本轮只修改提示音的播放恢复和同步保护；听力复习方案仍为讨论建议，没有修改学习流程、课程题量、词汇或学习记录格式。

修改：
- `src/feedbackAudio.ts`：完成音遇到媒体错误后最多重试一次；切换页面、静音或新动作取消待重试提示。相同完成动作不重复提示，刷新结果页仍保持安静。
- `src/App.tsx`：提示音等待、播放及重试期间使用现有同步应用保护。播放结束、取消或等待到期后释放保护。

## 复现证据

1. 临时媒体请求失败：隔离 Chrome 将完成音的首次预载和实际请求各中断一次。修复前 8 个场景没有完成播放；修复后同样条件均恢复到真实 MP3 的 `playing` 和 `ended`。证据：`reproduction-network/results.json`、`final-production-network/results.json`。
2. 同步打断：在隔离 Chrome 完成音开始播放后，按同步客户端已有的 `canApplySync` 检查模拟待应用远端更新。修复前两区都允许更新，`REMOTE_APPLIED -> App.apply -> stopAudio -> FeedbackAudio.stop` 在音频位置 0 / 0.003525 秒停止播放。修复后两区均等待音频结束，然后重新允许同步。证据：`reproduction-sync/results.json`、`sync-protected/results.json`。测试没有真实云端请求、配对凭证或远端数据写入。

上述是本地可重复的漏音路径；没有取得用户先前每一次漏音的现场事件记录，不能断言所有历史漏音都来自同一原因。

## 已执行检查

- `npx tsc --noEmit`：通过。
- `npm run build`：通过，部署资源校验通过。最终本地脚本：`dist/assets/index-Dm9N_0_I.js`。构建有大包体积提示，不影响此次构建成功。
- `node --test tools/test-audio-playback.mjs tools/test-reading-feedback.mjs`：27/27 通过。
- `node --test tools/test-course-loop.mjs tools/test-programming-content.mjs tools/test-programming-progress.mjs tools/test-daily-content.mjs tools/test-daily-progress.mjs`：53/53 通过。
- `node --test tools/test-progress-sync.mjs tools/test-course-upgrade-sync.mjs`：28/28 通过。
- 新专项 `tools/test-completion-sound-browser.mjs`：生产构建正常网络 8/8、临时请求失败 8/8；开发页面同步保护 2/2。覆盖两区、1440/390 宽度、快速检查后完成、最后一题恢复、连续完成下一节、真实 MP3 播放结束和刷新不重响。生产构建证据在 `final-production-normal/results.json`、`final-production-network/results.json`。
- 工作区原有 12 个已修改文件的 SHA-256 与 `preserved-changes-before.json` 相同。本轮没有改动它们。

初次运行旧的 `tools/test-reading-feedback-browser.mjs` 得到 6 项通过、10 项失败（`baseline/results.json`）。其中仍使用“开始学习”、旧题型和单题结束等前一阶段课程断言，与当前编程课程的直接开始测试、10 题及旧会话迁移规则不匹配。该脚本没有被报告为通过，也没有顺手修改；本轮新专项测试按当前课程规则验证完成音。

## 交付边界

本文记录首次修复完成、用户授权提交前的本地验收。该时点已修改源码并重新构建 dist；沿用 main，尚未提交、推送或发布。此次本地构建包含工作区原有未提交改动，其产物哈希不能当作随后线上发布的版本标识。所有浏览器验收使用隔离的 Chrome 测试上下文和测试学习状态，没有覆盖用户实际浏览器学习记录。验收证明真实媒体事件和进度持久化，不代表人工听到了电脑扬声器输出；未执行真机 Android 或真实跨设备云同步验收。
