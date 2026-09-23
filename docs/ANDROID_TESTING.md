# 安卓测试版 1.1.2

2026-09-23。包名 `com.codewords.english`，版本号 4，最低 Android 8.0（API 26），目标 Android 15（API 35）。使用较新的 Android System WebView。APK 位于 `artifacts/android/codewords-1.1.2-release.apk`，约 203.4 MiB，包含所有课程、3,620 个词及双声线点读录音。

## 使用及记录

把 APK 传到安卓手机后打开安装。首次安装按手机提示允许当前文件来源安装应用。安装完成后可断网点读、学习和复习。跟读使用手机已安装的系统英语识别服务，可能需要网络；仅在点击麦克风时申请录音权限。识别服务不可用、权限拒绝或网络错误不会判为读错，可使用“自己表达”继续。

学习记录保存在应用本机，开启私人同步码后与网页版共享。请先在有旧记录的网页开启同步，再在应用里输入同一同步码，见 [设备同步](SYNC.md)。通过页面“导出学习记录”选择本机文件位置保存 JSON。保留原始存储格式及损坏记录的导出方式。支持自动跨端同步，尚无任意 JSON 文件导入功能。卸载应用或清除应用数据会清除其本机记录；正常覆盖升级需保持同一包名与签名。

## 手机修复

- 修复缩短视口后底部答题栏遮挡书写输入框、口语自查文本框的问题。聚焦及视口变化时，只滚动当前答题区域，保存原草稿和题目。
- 适配状态栏、导航栏、屏幕边缘及软键盘；横屏低高度时顶部导航不再持续占据输入空间。
- 增大局部慢速、分区选择及风格选择的触控区域；避免“分类”标签在窄屏被竖排挤压。
- 课程、词级复习、词库、表达库、收藏和口语参考仍保留每条正常／慢速按钮，速度为 1 和 0.72，切换不丢练习。
- 安卓内的导出走系统文件保存界面；跟读桥接安卓系统识别，不依赖 WebView 是否实现网页 SpeechRecognition。

## 1.1.2 首次点读与异常恢复

用户在手机自带扬声器上仍反馈：打开后第一次点读无声；换词或先点慢速后有时恢复。这个完整的真机现象尚未在蓝叠重现，不能根据以下防御性修复认定已查明手机底层原因。

代码中确认了恢复缺口：收到原生 `playing` 后关闭超时检查，但该事件原先紧接 `start()` 就发送，没有检查播放位置；同词、同速度的再次点击被无限忽略。新增故障注入测试在旧代码上复现了这类请求锁住、网页空转及无法手动重试的问题，修复后通过。桥接或浏览器初始化同步抛错的路径也已覆盖。

- 加载中的连点和刚起播的双击合并处理；起播 750 ms 后主动再点原词可以从头重播，不要求先换词或切语速。
- 原生每 200 ms 检查位置，首次推进后才报告播放，持续回报进度。停滞 2 秒释放原生请求并尝试包内 HTML 音频；前端也独立检查进度和桥接超时。回退后的旧回调不能取消新播放器。
- 正常语速使用默认 `start()`；慢速由 `setPlaybackParams` 启动，不再在 Prepared 状态连续调用两种启动方式。Android 文档说明非零速度参数会使已准备的播放器开始播放，见 [MediaPlayer](https://developer.android.com/reference/android/media/MediaPlayer#setPlaybackParams(android.media.PlaybackParams))。这是一项兼容性调整，不是对手机根因的证明。
- 原生错误时读取播放位置失败也会发送错误回复；桥接关闭、初始化异常都会释放前端状态。音频焦点拒绝仍尊重系统，不通过备用播放器绕过。
- 录音加载和播放期间暂缓应用远端同步记录，防止刷新课程中断点读；结束后按既有自动同步流程继续。存储键、同步码、原始录音、声线及每条 1／0.72 语速保留。

本次检查：101 项 Node 测试通过（播放器、原生适配、同步及两区课程/进度）；TypeScript、生产构建、完整性检查、Release/Debug 构建及 Android Lint 通过。最终 APK 的 14,665 个网页文件与 dist 逐字节一致，包含 14,648 个 MP3，v2 签名与既有版本一致。

最终生产网页完成 49 项真实 MP3 播放检查，其中 8 项在独立的新浏览器上下文中分别把 repository、project、code、readme 作为第一次点读；另外覆盖两声线、两速度、切词返回、原词重播、1.2 秒加载延迟下连点及导航返回。局部语速/四种风格回归 12 组、44 次播放事件；包内路径和 CSP 回归 7 组，包含模拟原生卡住及首次桥接异常后实际 HTML MP3 回退；隔离 SQLite 同步浏览器回归 8 组，不涉及用户真实记录，未重跑真实 D1 服务。

最终 APK 在蓝叠 5（Android 9 / WebView 129）覆盖安装，首次安装时间和原课程会话保留。完成 9 次原生播放：新进程首次点击 repository、其慢速、project、回点 repository 时快速双击仅产生一次请求；退出应用页面并重新打开后第一次直接点击 code，随后 code 慢速/正常、readme 正常/慢速。均有位置推进并结束，0 错误。第二次打开是新 Activity/WebView，进程保留；没有把它称为完整系统重启。最终包 SHA-256 为 `6c4548b32c805ade563d9d5577d91ec93bb955b5b460d11c4f100425e2b14b4c`。

最终原生证据：`artifacts/audio-reliability/android-1.1.2-playback.txt`、`artifacts/audio-reliability/android-1.1.2-results.json`。先前候选包的 Guy 测试不计入这 9 次，记录保留在 `.runtime/android-audio-audit/android-1.1.2-candidate-native.txt`。未完成真机扬声器实听或原生播放中切后台的验证。

其他证据：`artifacts/audio-reliability/browser-results.json`、`artifacts/local-audio-controls/browser-results-production.json`、`artifacts/android/web-bundle-results.json`、`artifacts/sync-audit/results.json`、`artifacts/android/apk-validation-1.1.2.json`。播放器进度及结束事件仍不等同于手机扬声器实听验证。

## 1.1.1 点读修复与回归（历史）

已复现旧播放器在录音尚未起播时第二次点击会暂停、清空当前请求，造成无声；网络延迟会扩大这个时间窗口。原 APK 的录音齐全，首课文件可以完整解码，不能将问题笼统归因于网络或缺录音。用户手机上“无论点多少次都无声”的完整现象仍未在本机模拟器重现。

- 同一按钮加载中或播放中重复点击继续当前播放；换单词、换正常／慢速按钮从头播放。旧请求的失败、结束回调不能清掉新请求。
- 网页预加载当前课程的少量录音，复用最多 32 个播放器；不一次下载完整词库。缓冲超时和播放失败释放请求，允许下一次重试。
- 安卓使用系统 MediaPlayer 直接读取 APK 内未压缩 MP3，绕开 WebView 的常规音频播放路径。只允许固定录音目录及 1／0.72 两种速度，音高保持 1；不新增权限或依赖。原生解码失败才回退包内 HTML 音频；音频焦点被拒绝不会绕过系统焦点。
- 按原生与浏览器实际播放事件显示状态；页面离开和应用后台释放播放。两区学习状态、同步协议和存储格式保持兼容。

| 本次实际检查 | 结果与边界 |
| --- | --- |
| TypeScript、生产构建、项目音频完整性 | 通过；3,620 词、双声线各 7,241、日常 166 个 MP3 |
| 播放器、原生桥接、两区课程与进度单元测试 | 72 项通过；桥接回调在 Node 中模拟 |
| Chrome 局部语速、学习草稿与四种风格回归 | 12 组、44 次实际 MP3 playing 事件，见 `artifacts/local-audio-controls/browser-results.json` |
| Chrome 生产包首课音频 | 4 单词 + 4 例句 × 两声线 × 两语速，32 项全部播放至结束；另有 1.2 秒延迟下连点、离开课程返回两项，见 `artifacts/audio-reliability/browser-results.json` |
| 打包 HTTPS 地址与 CSP、原生优先和降级 | 5 组通过；Chrome 中模拟原生回调，包含真实 MP3 降级播放 |
| Release / Debug、Android Lint | 通过；Lint 无问题 |
| 签名与内容 | v2 签名有效，与 1.1.0 的证书一致；14,665 个网页文件逐字节匹配 dist，14,648 个 MP3。见 `artifacts/android/apk-validation-1.1.1.json` |
| 实际安卓模拟器 | 蓝叠 5、Android 9、WebView 129；1.1.0 覆盖升级 1.1.1，包名和首次安装时间保留，课程继续原会话 |
| APK 原生点读 | 24 次开始及完成记录，包括首课四词 × 两声线 × 两速度 16 项、例句、试听及日常 Hello；0 播放错误，原生接收请求至启动 4–11 ms。见 `artifacts/audio-reliability/android-1.1.1-results.json` |
| 后台和页面切换 | 返回后继续课程、切换声线及日常点读通过；尝试在播放中切走时录音已结束，因此未据此宣称验证了原生播放中断 |

日志证明播放器开始、时间推进及完成，不代表录下并听辨了扬声器输出。真机仍需用户确认第一课是否恢复、实际出声延迟和音色；麦克风系统识别、文件选择器及真机键盘不属于此次音频回归。前版同步、布局与收藏报告保留于 `artifacts/`，本次未重跑真实 D1 同步。

## 实现与权限边界

原前端、词库、学习算法及 `localStorage` 格式复用。AndroidX WebKit 是安卓壳唯一直接运行依赖，用于安全加载本地资源及消息桥；没有增加 npm 依赖。APK 大小主要来自现有双声线录音。原生点读使用 [MediaPlayer](https://developer.android.com/reference/android/media/MediaPlayer) 及 [音频焦点](https://developer.android.com/media/optimize/audio-focus)，资源只从包内读取。

使用 [WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content) 的 `https://appassets.androidplatform.net/assets/web/index.html` 加载包内页面。文件／content URL 访问关闭，混合内容关闭，未命中的资源直接拒绝。消息桥只允许该固定 origin 的主框架，限定系统识别、包内录音点读及 JSON 导出；没有任意文件路径、命令执行或通用 JS 接口。实现参考 [Android 消息桥说明](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge) 和 [系统语音识别接口](https://developer.android.com/reference/android/speech/SpeechRecognizer)。

Manifest 申请 `RECORD_AUDIO` 和同步所需的 `INTERNET`，不申请存储、联系人或定位权限。WebView 请求和 CSP 仅放行打包资源及指定 Cloudflare `/api/sync`，不开放任意站点。系统识别服务独立处理声音，应用只保存识别文本；不保存录音。外部页面不能在这个 WebView 中打开。导出通过系统选择器返回的 URI 写文件，网页不能指定设备路径。Release 关闭 WebView 调试和系统自动备份。

## 构建及复核

准备 JDK 17+、Gradle 8.11.1、Android SDK Platform / Build Tools 35。工具链安装在机器本地，路径通过参数传入，不写入源码；本次复用了已有工具链，没有修改全局 Java、SDK、系统驱动或其他项目源码。

```powershell
npx tsc --noEmit
node --test tools/test-audio-playback.mjs tools/test-native-android.mjs
./scripts/Build-Android.ps1 -SdkPath '<SDK 路径>' -JavaPath '<JDK 路径>' -GradlePath '<gradle.bat 路径>' -InitializeSigning -Validate
python tools/verify_android.py artifacts/android/codewords-1.1.2-release.apk --output artifacts/android/apk-validation-1.1.2.json
# 使用 SDK 的 build-tools/35.0.0/apksigner.bat verify --verbose <apk> 验证签名。
```

脚本默认重新构建网页并校验音频。`-InitializeSigning` 仅首次在 `.runtime/android/codewords-release.jks` 生成签名，配置保存在被忽略的 `android/keystore.properties`；后续沿用，不覆盖密钥。请保留这两个本机文件以支持更新。没有配置签名的 Release 构建会失败，不输出假称可安装的未签名包。`-Validate` 同时编译 Debug 并执行 Release Lint。

APK 与运行时、密钥不进入 Git。产物旁的 `.sha256` 用于传输校验。该文档记录本次验证状态；后续如完成真机测试，应按真实证据更新未完成项。
