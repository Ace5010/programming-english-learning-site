# 提交前复查与安卓 1.1.3

2026-09-24。本次实际检查发现并修复了三处交互问题：恢复纠错时输入框抢焦点、错误解释可能留在屏幕下方、带句末标点的单词不能进入局部拼写纠错。两区课程和词汇复习的恢复都已加入针对性回归；标点不作为拼写错误，仍只允许一次修改。

目前仍暂缓提交和推送，用户新增的具体音素评测未通过验收。此前交互修复脚本为 `index-0hmA9Sw8.js`；修复 `good bye` 分词后当前网页为 `index-DmuWKR-G.js`。APK：`artifacts/android/codewords-1.1.3-release.apk`，版本号 5，SHA-256 `baab5cb47495b2d14e028b3d020536003bc8c5e968be7057655dce433ca10c33`，保留原包名和签名。以下分别记录两次检查的范围，不把旧报告视为新音素评测成功。

## 自动与浏览器检查

| 检查 | 结果 |
| --- | --- |
| TypeScript、生产构建、资源完整性 | 通过；3,620 词、Aria / Guy 各 7,241 MP3、旧 Piper 7,122 MP3 |
| 自动测试 | 263 / 263，通过，见 `final-unit-tests.txt` |
| 两区课程及词汇复习新交互 | 14 / 14，见 `final-course/browser-results.json`；包含纠错前后刷新、焦点恢复、第二次错误、两区完整一轮及下一节 |
| 手机布局 | 13 / 13，见 `final-mobile/browser-results.json`；320、360、412 宽度、横屏、键盘高度与四种风格 |
| 新点读与提示音 | 14 / 14，39 次真实播放事件，见 `final-reading/results.json` |
| 全站逐条正常／慢速点读 | 12 / 12，44 次真实播放事件，见 `audio-controls/browser-results.json` |
| 首击、连续点读、卡住恢复 | 49 / 49，见 `audio-reliability/browser-results.json` |
| 同步界面与断线恢复 | 8 / 8，隔离 SQLite 模拟服务，见 `sync/results.json`，不是在线 D1 验收 |
| 安卓包内路径、CSP 与桥接 | 7 / 7，见 `apk-web/web-bundle-results.json`；此组识别和导出回调为模拟 |
| 识别权限、取消、延迟结果及异常 | 9 / 9，模拟事件，见 `speech-lifecycle/simulated-browser-results.json` |
| Chrome 真实识别服务 | 2 组通过，实际识别 hello、goodbye、长句及不同姓名的自由表达，见 `speech-service/native-ui-results.json`；输入是已有课程音频，不使用物理麦克风、不伪造返回文字 |
| 音频完整解码 | 日常 166、补充点读与提示音 579，全部通过 |
| 安卓打包 | Release、Debug、lintRelease、签名检查通过；15,246 个包内网页文件逐字节匹配 dist，见 `../../android/apk-validation-1.1.3.json` |

原点读脚本有四处按钮名称定位过时，真实识别脚本仍断言固定教学范围完成时间。已更新为当前隐藏答案的按钮名称和动态轮次语义，再运行通过；没有把识别自查计作独立掌握。

最终三处修复后重新运行 263 项自动测试、14 项新交互、13 项手机布局、14 项点读与真实浏览器识别；未受影响的旧播放器及隔离同步结果沿用本次修复前已通过的检查，不重复计算测试数量。

之后根据用户真实 `Goodbye` 输入修复空格／连字符分词问题。重新通过 53 项相关自动回归（包含 1 项新增用例）、类型检查及网页构建，见 `goodbye-regression-tests.txt`。在最新隔离 QA APK 回放此前真实识别出的 `good bye`，页面已显示“这句已识别完整”，见 `emulator/goodbye-spacing-regression.json`。这是保存结果的界面回归，不是新一轮麦克风输入。重新打包通过 Release、Debug、Android Lint、原签名与 15,246 个网页文件逐字节检查，见 `goodbye-android-build.txt`、`goodbye-apk-signature.txt` 和最新 APK 验证 JSON。

最新 Release 已于 13:22 再次覆盖安装；首次安装时间仍为 11:59:53。重开仍显示原来完成的 20 项练习（17 项独立作答、2 项修改正确、1 项需要帮助），见 `emulator/goodbye-release-after-update.png`。没有清除或重新植入正式包的学习记录。

## 安卓实际操作与麦克风

使用已存在的 MuMu 测试实例，Android 12 / Android System WebView 110；CodeWords 独立包首次安装和覆盖安装均成功，学习保持本机状态。实际打开两区入口、日常课程教学、正常与慢速播放、选择题、填空、短句输入和一次纠错，并验证关闭重开及覆盖安装后继续原会话。原生播放器的播放位置推进并正常结束。

临时本地诊断程序调用 Android `AudioRecord`：16 kHz、单声道、PCM16，约 3 秒读取 48,128 个样本；33,412 个非零样本，峰值 324、RMS 25.68，权限已允许。不保存录音，不联网。这证明模拟器采集链路运行，不证明文字识别或手机扬声器听感。截图见 `emulator/microphone-probe.png`。

模拟器起初未注册系统识别服务，随后按用户授权在 MuMu 测试实例安装了独立离线 `com.codewords.emulatorspeech/.LocalRecognitionService`，通过标准 Android 系统回调接入课程。实际用户输入返回 `hello`、`good bye` 和 `goodbye`；重开后保留识别文字，取消不会覆盖原结果。证据见 `emulator/native-mic-before-reload.json`、`emulator/native-mic-after-reload.json`。该服务只申请录音权限，不联网、不保存音频，也没有把目标答案作为识别约束。

**系统采集及回调已连通，但口语准确率与具体音素评测未通过。** 小型离线模型曾把用户的 `Goodbye` 识别为 `with by`，不能只用成功片段宣称准确。两种独立本地音素模型又分别出现易混音误判和正常 `/d/` 漏检，未接进正式课程；详见 [发音评测状态](../../../docs/PRONUNCIATION_ASSESSMENT.md) 与 `pronunciation/local-feasibility.json`。实体手机安装、真实扬声器实听和线上 D1 同步也不在本次通过范围内。

随后按用户授权完成 Azure Speech Studio 匿名免费云端试用：10 个公开合成音频，共 15.96 秒；7 个正确样本准确度均 100，3 个易混词的实际替换音均为最低音素分。但三个错误词的整词分数仍有 70–87，部分相邻音也被连带扣分，不能直接照搬整词通过规则或把所有低分音标错。详见 `pronunciation/cloud-test-results.json`。未上传用户录音、未开通付费、未配置正式 API 资源；课程接入和真人口音验收仍未完成，暂缓提交推送继续有效。

按用户最新“普通网络可用、无需 VPN”的要求，随后完成讯飞流式评测实际调用。免费应用创建前取得明确授权；控制台测试前显示 500 次免费余量。10 个公开课程样本通过指定物理以太网的 WebSocket 连接完成，未使用代理或 VPN 网卡，未上传用户录音、未购买套餐。网络链路通过，但精度未通过：`sink` 对 `think` 仍获 98.34 分，`sheep` 对 `ship` 仍获 97.83 分，且未给出可用的逐音错误标记。见 `pronunciation/xfyun-test-results.json`。该接口未接入课程。

用户完成实名认证后，已领取 Suntone 中英文免费包（1,000 次、30 天、实付 0 元），控制台确认余量到账。13 项离线测试及 10 个公开样本的 MP3 预检通过，并通过物理以太网完成 10 次真实请求。两种 `Goodbye` 的 D 均为 100，`free` 对 `three` 的 TH 为 2，但 `sink` 对 `think` 的 TH 仍为 94.7、整词为 99.1，精度仍未达到自动判错要求。见 `pronunciation/suntone-test-results.json`。未上传用户录音、未购买付费包、未集成生产课程。

用户了解正式费用后明确选择“还是以免费方案为主”。后续回到长期免费的本机能力验证，不依赖 30 天试用包。课程具体音素评测仍未完成，提交推送继续暂停。

免费本机组合原型已启动，只监听 `127.0.0.1:18765`，复用已有 Whisper large-v3、TIMIT int8 和本机 Python，不下载新模型、不调用云端、不保存录音。28 个公开音频的 44 组初步对照发现 3 个正确样本未能确认及 1 处错误音定位；没有把初测称为通过。加入文字与独立音素证据交叉核对后，6 项规则回归通过，实际本机 HTTP 链路的 6 个主用例及 4 个边界用例通过预期结果，静音及 3 种未授权请求也按预期拒绝。正常 Guy `bed` 和 `then` 仍返回未能确认，不算发音错误；真人口音和安卓接入仍未完成。见 `pronunciation/local-combined-feasibility.json`、`local-server-results.json`、`local-consensus-regression.json`。Chrome 测试页已打开，等待用户准备好再录制 Goodbye。

构建保留原有主 JavaScript 超过 500 KB 的体积提示，未引入新的生产依赖或改变架构。
