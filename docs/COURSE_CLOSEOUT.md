# 当前课程修复收尾记录

2026-10-03，北京时间。范围由用户明确确认：只收尾现有实现与验收，不扩展后续 A1、A2/B1/B2 或具体错音诊断。接手时已有未提交课程修复，本轮在原工作区继续，未新建分支、提交、推送或发布。

## 完成的修复

- `programmingSupport.ts` 将函数声明里的参数名与普通冠词区分。实际题 `P1-02-02-r02` 中的 `a`、`b` 显示为参数名；普通句子的 `a` 仍为冠词义。英文题面与音频文本未改。
- `DailyEnglish.tsx` 为未结束的复习提供“开始新的一课”入口。课程首页仍不提前承诺下一轮内容；切换前保持原题、草稿和证据，取消不写学习记录，确认后才安排新课。浏览器逐项核对确认前、取消后、确认后的记录与刷新恢复。
- 自适应浏览器测试使用实际开始／继续入口、带主题的课程标题、配对题、带干扰词的排序及首次答错后的重试流程。修正排序题误点慢速按钮的问题，保留准入、困难回流、去重、随机、草稿和同步兼容断言。
- 浏览器报告可以写入独立产物目录。只有完整通过、且两区都具有可解析的真实准入记录时，才原子替换供后续测试使用的夹具；失败、部分运行、损坏记录均保留旧夹具。定向复习测试缺夹具时明确失败，不静默跳过。
- 手机测试可明确选择夹具路径并先验证；本轮使用刚由浏览器作答产生的夹具。布局和自查测试只模拟本机识别服务“不可用”的探测响应，没有调用麦克风或模拟识别成功。
- 同步浏览器测试适配四套现有配色，可让两端使用本次本地构建，真实 API 请求继续到已部署的 Pages Function／D1。手机 origin 的包内资源由浏览器模拟，不冒充实体设备。
- 修正旧验收记录中对配色名称的过时描述，并明确区分历史失败与本轮结果。

## 实际检查结果

| 检查 | 结果与证据 |
| --- | --- |
| TypeScript | `npx tsc --noEmit` 通过 |
| 课程、范围、升级、准入、重点词、夹具保护 Node 回归 | 136/136；完整编程推进 126 轮、1429 次作答、935 道不同题，全部目标完成准入 |
| 课程主页 Node 回归 | 12/12；未结束复习不预告下一轮内容的规则继续通过。主页与课程相关批次复验 65/65，含已计入的重复测试 |
| 同步协议与隔离 SQLite | 20/20 Node 回归；8/8 浏览器场景，`artifacts/course-closeout/sync-local/results.json` |
| 自适应 Chrome 完整链路 | 20/20，406 次客观作答、4 次口语自查，无浏览器错误或失败请求；`artifacts/course-closeout/adaptive-complete/browser-results.json` |
| 生产构建 Chrome | 5/5，32 次客观作答；两区开始、保存、下一轮、取消／确认切换、刷新、双声线播放；`artifacts/course-closeout/production/browser-results-production-production-smoke-confirm-switching-real-Aria.json` |
| 课程升级 Chrome | 17/17；`artifacts/course-closeout/upgrade/browser-results.json` |
| 手机切换确认补测 | 两区 390 像素 2/2，取消／确认、草稿与证据保存、无横向溢出；`artifacts/course-closeout/switch-mobile/` |
| 手机浏览器仿真 | 13/13；320/360/412/844 像素与键盘高度，四套配色；`artifacts/course-closeout/mobile-final/browser-results.json` |
| 重点词 Chrome | 9/9；from、student、teacher 的 Aria／Guy 共 6 段录音，各以 1 倍与 0.72 倍播放到 ended，保持音高且不增加学习证据；`artifacts/course-closeout/word-final/report.json` |
| 真实 D1 | 最终构建与最新夹具 7/7：配对、双区进度、收藏、离线补传、刷新、冲突备份选择、断开保留本机记录；`artifacts/course-closeout/sync-live-final/live-results.json` |
| 构建／资源完整性 | `npm run build`、`npm run verify` 通过；15,996 个部署文件；3,620 词，Aria／Guy 各 7,241，旧 Piper 7,122；日常 172、补充 582、基础 596、音标 88 段录音清单通过；无缺失或空音频 |
| 差异检查 | `git diff --check` 通过；既有 `artifacts/adaptive-course/` 受控产物未覆盖 |

最终构建入口为 `dist/assets/index-B3eH5B9m.js`。构建仍有既有大包体积提示，本轮未进行无关拆包。

开发完整链路在补充取消断言之前启动；最终构建的两区切换场景已明确覆盖取消不改记录和随后确认，最终相关脚本的补测记录在生产报告中。浏览器、Node、真实 D1 的测试数据均为隔离数据；不读取用户真实浏览器记录。真实 D1 使用临时随机同步码，报告不保存同步码，也未发布本次前端。

## 复跑方法

先确认 5186 为本项目 Vite。完整自适应测试成功后，才将生成的夹具传给后续测试：

```powershell
$env:CODEWORDS_ARTIFACT_DIR = 'artifacts/course-closeout/adaptive-complete'
node tools/test-adaptive-course-browser.mjs
$env:CODEWORDS_EARNED_FIXTURES = 'artifacts/course-closeout/adaptive-complete/earned-fixtures.json'
$env:CODEWORDS_ARTIFACT_DIR = 'artifacts/course-closeout/mobile-final'
node tools/test-mobile-browser.mjs
```

生产冒烟使用 `CODEWORDS_TEST_URL=http://localhost:5186/dist/`、独立产物目录与 `CODEWORDS_SCENARIO=production smoke|confirm switching|real Aria`。执行同步检查前清除这个场景过滤；默认是隔离 SQLite。明确进行真实 D1 检查时设置 `CODEWORDS_LIVE_SYNC=1` 与 `CODEWORDS_LIVE_LOCAL_BUNDLE=1`，仍使用隔离浏览器和临时同步码，不需要发布。

## 验收边界

- 用户本轮明确表示暂时无法配合，安卓实体手机与本人课程麦克风体验保留待验收。手机仿真、生产浏览器与模拟 APK origin 都不替代真机安装、扬声器实听、原生识别、文件保存或实际跨设备同步。
- 真实 D1 验证的是最终本地构建到现有线上接口的双浏览器链路；线上已部署前端没有更新。
- 辅助释义的已知代码参数错误与已有语境错误已修复，题库范围和答案泄露检查通过；这不等于所有语境已由外部教学专家审校。学习效果仍需真实使用数据。
- 具体错音诊断与后续全套课程不在本轮范围内，没有将其报告为完成。

调试时的失败报告保存在本轮产物的 `adaptive`、`adaptive-probe`、`adaptive-final`、`adaptive-verified` 等目录，包括旧选择器、未启动服务和一次浏览器网络变化的证据；它们不替代上述最终通过报告。失败时原有可用夹具均未被空文件覆盖。
