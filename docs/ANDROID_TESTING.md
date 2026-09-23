# 安卓测试版 1.1.1

2026-09-23。包名 `com.codewords.english`，版本号 3，最低 Android 8.0（API 26），目标 Android 15（API 35）。使用较新的 Android System WebView。APK 位于 `artifacts/android/codewords-1.1.1-release.apk`，约 203.4 MiB，包含所有课程、3,620 个词及双声线点读录音。

## 使用及记录

把 APK 传到安卓手机后打开安装。首次安装按手机提示允许当前文件来源安装应用。安装完成后可断网点读、学习和复习。跟读使用手机已安装的系统英语识别服务，可能需要网络；仅在点击麦克风时申请录音权限。识别服务不可用、权限拒绝或网络错误不会判为读错，可使用“自己表达”继续。

学习记录保存在应用本机，开启私人同步码后与网页版共享。请先在有旧记录的网页开启同步，再在应用里输入同一同步码，见 [设备同步](SYNC.md)。通过页面“导出学习记录”选择本机文件位置保存 JSON。保留原始存储格式及损坏记录的导出方式。支持自动跨端同步，尚无任意 JSON 文件导入功能。卸载应用或清除应用数据会清除其本机记录；正常覆盖升级需保持同一包名与签名。

## 手机修复

- 修复缩短视口后底部答题栏遮挡书写输入框、口语自查文本框的问题。聚焦及视口变化时，只滚动当前答题区域，保存原草稿和题目。
- 适配状态栏、导航栏、屏幕边缘及软键盘；横屏低高度时顶部导航不再持续占据输入空间。
- 增大局部慢速、分区选择及风格选择的触控区域；避免“分类”标签在窄屏被竖排挤压。
- 课程、词级复习、词库、表达库、收藏和口语参考仍保留每条正常／慢速按钮，速度为 1 和 0.72，切换不丢练习。
- 安卓内的导出走系统文件保存界面；跟读桥接安卓系统识别，不依赖 WebView 是否实现网页 SpeechRecognition。

## 1.1.1 点读修复与回归

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
python tools/verify_android.py artifacts/android/codewords-1.1.1-release.apk --output artifacts/android/apk-validation-1.1.1.json
# 使用 SDK 的 build-tools/35.0.0/apksigner.bat verify --verbose <apk> 验证签名。
```

脚本默认重新构建网页并校验音频。`-InitializeSigning` 仅首次在 `.runtime/android/codewords-release.jks` 生成签名，配置保存在被忽略的 `android/keystore.properties`；后续沿用，不覆盖密钥。请保留这两个本机文件以支持更新。没有配置签名的 Release 构建会失败，不输出假称可安装的未签名包。`-Validate` 同时编译 Debug 并执行 Release Lint。

APK 与运行时、密钥不进入 Git。产物旁的 `.sha256` 用于传输校验。该文档记录本次验证状态；后续如完成真机测试，应按真实证据更新未完成项。
