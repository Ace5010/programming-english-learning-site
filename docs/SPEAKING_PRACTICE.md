# 口语识别接入

2026-09-15。现有日常课程中的 12 道口语题增加真实麦克风识别入口，原有自由表达自查保留。没有新增依赖、后台、账号、密钥或录音文件；本地端口仍是 5186。

## 使用

1. 选择“跟读示例”，点“听示范”或“慢速”。
2. 点“点击开始说”，允许浏览器使用麦克风，然后朗读对应句子。界面收到真实收音事件后才显示“正在听”。
3. 识别完整时自动结束；也可点“读完了”。对齐结果显示已识别、未识别到、被识别成其他词及多识别到的词，点击“再读一次”重试。
4. 全部参考句匹配后点“完成跟读”。结果、已完成句子和最终识别文字随学习进度保存。
5. 说自己的姓名、来源或自由回答时切换“自己表达”。此处把声音转为可编辑文字，保留原题自查项，不把与示例不同的姓名当成错误。

跟读只比较识别文字，不提供音素、口音、语调或发音质量分数。大小写、标点、常见缩写及 0–100 的数字写法归一化；词序、漏词、多词和替换仍影响匹配。空结果和临时结果不会通过，也不会计入答错。

## 浏览器与数据

- 使用 `SpeechRecognition` / `webkitSpeechRecognition`。检测到已安装的本地英语识别时优先使用；不自动下载语言包。否则由浏览器语音服务识别，声音可能发往该服务，按钮前有说明。本站不保存录音。
- 需要 HTTPS 或 localhost 安全环境、受支持的浏览器和麦克风权限。权限拒绝、无设备、无声音、网络服务失败和启动超时均有提示，不虚构识别结果。
- 仅主动点击开始监听；离开题目、分区、隐藏页面或切换表达方式会取消监听，取消后的晚到事件不保存。主题切换保留正在进行的识别。收音最多 40 秒，停顿后自动收尾，也可手动结束。
- `codewords-daily-v1` 仍为版本 1，草稿仅增加可选 `speech: { mode: 'read' | 'self', transcripts: { [phraseId]: string } }`。旧记录和旧自查反馈兼容；原有编程英语键、课程规则和音频文件未修改。
- 跟读仍记录为 `self` 类口语练习，不把识别文字匹配当作独立掌握或隔日记忆证据。

## 验证与边界

- 类型检查与 97 项纯函数测试通过，其中新增 15 项逐词对齐测试、5 项口语状态与旧记录兼容测试。
- `tools/test-daily-speech-browser.mjs`：9 组模拟识别事件测试通过，覆盖临时/最终结果、错词重读、权限/网络/静音/无设备、取消后的晚到事件、手动停止后到达的最终结果、切换主题与分区、旧标签页保护、启动超时和不支持浏览器的替代入口。**这些异常是可控模拟，不能当作真实服务识别证据。**
- `tools/test-daily-speech-native.mjs`：隔离 Chrome 152 调用真实识别服务，以已有课程 MP3 的合成音轨输入，未模拟结果事件。第一课 Hello → 刷新 → Goodbye → 跟读完成 → 本课完成通过；长句和不同姓名的自由表达转写、编辑与刷新通过。四种主题 × 1440 / 1920 / 390px 无横向溢出。
- 原有日常英语 10 组浏览器回归通过，覆盖 24 课 / 120 道主练习、纠错、自查路径、多空键盘、双声线与速度、刷新恢复、损坏数据和原有编程记录保护。
- `npm run build`、`npm run verify` 通过：3,560 词、原有 Aria / Guy 各 7,121 个 MP3、日常音频 166 个均完整。静态成品的嵌套路径、两区真实点读和刷新恢复通过生产页面检查。构建保留既有单包超过 500 KB 的提示。
- 没有使用用户的真实麦克风，因此用户设备的收音质量和真人发音识别准确率尚未实测；没有下载或验证本地识别语言包。

运行脚本时，`CODEWORDS_TEST_URL` 指向现有服务，`CODEWORDS_PLAYWRIGHT` 指向已经安装的 Playwright。真实服务测试使用合成音轨，不打开物理麦克风；相关 helper 为 `tools/helpers/native-speech-input.mjs`。

证据： [真实语音 UI 结果](../artifacts/daily-speech/native-ui-results.json)、[异常模拟结果](../artifacts/daily-speech/simulated-browser-results.json)。截图： [简约桌面](../artifacts/daily-speech/read-minimal-1440.png)、[手绘](../artifacts/daily-speech/read-sketch-1440.png)、[涂鸦](../artifacts/daily-speech/read-graffiti-1440.png)、[手机](../artifacts/daily-speech/read-minimal-390.png)。

API 行为依据：[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)、[设备内识别](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)。
