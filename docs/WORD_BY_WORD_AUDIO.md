# 逐词慢读

正常朗读保留完整录音；单个词保持原有 0.72 倍、变速不变调。句子与空格分隔的短语使用共享 `AudioPlayback` 的整条队列。音素入口保持原状。

`slowReadingText.ts` 保留缩写、实际词形、大小写、金额、数字及技术写法；不能识别的字符报错，不能静默漏读。`slowPronunciations.ts` 为现有语料中的 read/live/use/record/close/used 指定语境读音。多读音来源通过带上下文的合成与词边界截取建立，不修改原句或答案。新语料须复核多读音映射，不能把当前清单称为通用英语发音消歧器。

每个片段按 0.72 倍播放。目标词间静音为 300 毫秒，句末后还有内容时为 550 毫秒。生成器完整解码录音，以 10 毫秒 RMS 窗口、约 -48 dB 阈值检测首尾静音，保留前 40 / 后 60 毫秒保护区。队列的额外等待扣除相邻保护区经变速后的时长。播放边界检查每 15 毫秒运行；实际间隔还包含浏览器/设备加载、寻址和计时误差，不能代替样音实听。

已有合适录音只读复用，未覆盖的词在开发阶段用现有 Aria/Guy 工具补录。新增录音按每包最多 100 个单位分别打包，保存准确片段位置；原双声线目录及原有整句录音不变。合成原件和可恢复清单在 `.runtime/slow-audio/`；部署只包括 `public/audio/slow/` 的音频包和审计清单。打包是为保持部署文件数低于 20,000，每个包也检查低于 25 MiB。

网页预热当前内容的资源，整次点击复用同一个媒体元素；不会每个词模拟一次用户点击。队列期间，包括停顿、加载及寻址，播放任务和同步保护持续有效，提示音等待任务结束。换内容、切题、切分区、切声线、关闭页面及后台均取消任务；旧回调不能重启队列。加载、解码或播放权限错误会终止并反馈，不跳词、不混声线、不回退到整句降速。既有正常单文件播放保留原错误恢复机制。

安卓桥一次接收整个列表，本地 `MediaPlayer` 管理边界、停顿和整次音频焦点。前端与 Java 只允许受限包内 `aria/guy`、`daily`、`reading`、`foundation`、`slow` 路径。原生后台及焦点丢失取消待播词。打包片段先等待寻址完成，再开始播放；停顿期间不运行卡顿检测。

重新生成与校验：

```powershell
node scripts/slow-reading-inventory.mjs --write
.runtime/slow-audio-venv/Scripts/python.exe tools/generate_slow_audio.py --workers 8
python tools/verify_slow_audio.py
npx tsc --noEmit
node --test tools/test-audio-playback.mjs tools/test-native-android.mjs tools/test-slow-audio.mjs
npm run build
npm run verify
node tools/test-slow-audio-browser.mjs
```

生成环境使用项目既有 `edge-tts==7.2.8`、FFmpeg，加上仅用于开发期 PCM 分析的 NumPy；没有新增网页或安卓运行依赖。清单失配、缺失片段、文本/声线/哈希错误会阻止构建。`verify_slow_audio.py` 另完整解码所有引用录音并核对片段边界。

自动化事件、样音听感、安卓模拟器与实体手机属于不同证据。最终结果见 `artifacts/slow-reading/verification.md`；未验证的项目不得据此称为通过。
