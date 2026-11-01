# 逐词慢读

正常朗读使用完整原速录音；单词、短语和句子的慢读主要使用独立 `-40%` 合成的 Aria/Guy 录音，7 段经比较后采用原录音作 0.60 倍保音高降速，播放器统一以 1 倍播放，避免再次降速。句子与空格分隔的短语使用共享 `AudioPlayback` 的整条队列；基础教程的连续慢读使用完整慢速句子。音标和固定示范使用原录音作 0.60 倍保音高播放。

`slowReadingText.ts` 保留缩写、实际词形、大小写、金额、数字及技术写法；不能识别的字符报错，不能静默漏读。`slowPronunciations.ts` 为现有语料中的 read/live/use/record/close/used/refuse 指定语境读音。多读音来源通过带上下文的合成与词边界截取建立，不修改原句或答案。`contextualReading.ts` 将句内点读的上下文传递到正常／慢速选音，正常语境录音位于同一音频包目录。新语料须复核多读音映射，不能把当前清单称为通用英语发音消歧器。

每个片段按 1 倍播放。目标词间静音为 300 毫秒，句末后还有内容时为 550 毫秒。生成器完整解码录音，以 10 毫秒 RMS 窗口、约 -48 dB 阈值检测首尾静音，保留前 80 / 后 100 毫秒保护区。队列额外等待扣除相邻保护区时长。音量目标为有效语音 RMS -20 dBFS，最多提升 6 dB，并保留至少 1.5 dB 峰值余量。实际间隔还包含浏览器/设备加载、寻址和计时误差。

慢读片段按每包最多 40 个单位打包，保存片段位置。合成原件与缓存位于 `.runtime/audio-optimization-20261031/`；0.60 倍输出与此前 0.72 倍备份位于 `.runtime/audio-slow-060-20261101/`。部署只包括 `public/audio/slow/` 的音频包和审计清单。打包是为保持部署文件数低于 20,000，每个包检查低于 25 MiB。清单版本 2 同时记录内容清单、读音配方及保留音源的哈希；旧生成器拒绝覆盖版本 2。

网页预热当前内容的资源，整次点击复用同一个媒体元素；不会每个词模拟一次用户点击。队列期间，包括停顿、加载及寻址，播放任务和同步保护持续有效，提示音等待任务结束。换内容、切题、切分区、切声线、关闭页面及后台均取消任务；旧回调不能重启队列。加载、解码或播放权限错误会终止并反馈，不跳词、不混声线、不回退到整句降速。既有正常单文件播放保留原错误恢复机制。

安卓桥一次接收整个列表，本地 `MediaPlayer` 管理边界、停顿和整次音频焦点。前端与 Java 只允许受限包内 `aria/guy`、`daily`、`reading`、`foundation`、`slow` 路径。原生后台及焦点丢失取消待播词。打包片段先等待寻址完成，再开始播放；停顿期间不运行卡顿检测。

重新生成与校验：

```powershell
node scripts/slow-reading-inventory.mjs --write
.runtime/slow-audio-venv/Scripts/python.exe tools/generate_clear_slow_audio.py --workers 2 --normal-assets .runtime/audio-optimization-20261031/normal --output-dir .runtime/audio-slow-060-20261101/generated
# 先核对临时目录输出和抽检结果，再替换公共资源及运行索引；本轮安装脚本仅适用本轮基线。
python tools/verify_slow_audio.py
npx tsc --noEmit
node --test tools/test-audio-playback.mjs tools/test-native-android.mjs tools/test-slow-audio.mjs
npm run build
npm run verify
node tools/test-slow-audio-browser.mjs
```

生成环境使用 `edge-tts==7.3.1`、FFmpeg，加上仅用于开发期 PCM 分析的 NumPy；没有新增网页或安卓运行依赖。清单失配、缺失片段、文本/声线/哈希错误会阻止构建。`verify_slow_audio.py` 完整解码所有引用录音并核对片段边界。

自动化事件、样音听感、安卓模拟器与实体手机属于不同证据。当前 0.60 倍结果见 `artifacts/audio-slow-060-20261101/verification.json`；此前全量音源优化见 `artifacts/audio-optimization-20261031/verification.json`，旧 `artifacts/slow-reading/` 记录更早版本。
