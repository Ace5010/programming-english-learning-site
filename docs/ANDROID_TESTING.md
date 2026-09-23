# 安卓测试版 1.0.0

2026-09-23。包名 `com.codewords.english`，版本号 1，最低 Android 8.0（API 26），目标 Android 15（API 35）。使用较新的 Android System WebView。APK 位于 `artifacts/android/codewords-1.0.0-release.apk`，约 203.4 MiB，包含所有课程、3,620 个词及双声线点读录音。

## 使用及记录

把 APK 传到安卓手机后打开安装。首次安装按手机提示允许当前文件来源安装应用。安装完成后可断网点读、学习和复习。跟读使用手机已安装的系统英语识别服务，可能需要网络；仅在点击麦克风时申请录音权限。识别服务不可用、权限拒绝或网络错误不会判为读错，可使用“自己表达”继续。

学习记录保存在应用本机，与网页版 `localStorage` 独立，不会自动复制浏览器进度。通过页面“导出学习记录”选择本机文件位置保存 JSON。保留原始存储格式及损坏记录的导出方式。当前未增加跨端同步或导入功能。卸载应用或清除应用数据会清除其本机记录；正常覆盖升级需保持同一包名与签名。

## 手机修复

- 修复缩短视口后底部答题栏遮挡书写输入框、口语自查文本框的问题。聚焦及视口变化时，只滚动当前答题区域，保存原草稿和题目。
- 适配状态栏、导航栏、屏幕边缘及软键盘；横屏低高度时顶部导航不再持续占据输入空间。
- 增大局部慢速、分区选择及风格选择的触控区域；避免“分类”标签在窄屏被竖排挤压。
- 课程、词级复习、词库、表达库、收藏和口语参考仍保留每条正常／慢速按钮，速度为 1 和 0.72，切换不丢练习。
- 安卓内的导出走系统文件保存界面；跟读桥接安卓系统识别，不依赖 WebView 是否实现网页 SpeechRecognition。

## 实际检查

| 检查 | 结果与边界 |
| --- | --- |
| TypeScript、网页生产构建、项目词汇／音频完整性 | 通过 |
| 学习、旧记录兼容、判题、自适应、长期复习相关 Node 测试 | 197 项通过 |
| 安卓桥接生命周期、错误、晚到消息、导出与来源隔离 Node 测试 | 6 项通过，原生回调模拟 |
| Chrome 手机布局 | 13 组通过；320/360/412 窄屏、844 横屏、四种风格、两区全部入口、长词、题型与词级复习；键盘用缩短视口模拟 |
| 收藏流程 | 8 组通过，含刷新、取消、分页、旧记录和小屏 |
| 局部正常／慢速播放 | 12 组通过，44 次真实 MP3 playing 事件；不代表听到了手机扬声器 |
| 语音界面错误与生命周期 | 9 组通过，模拟识别事件；未调用真实语音服务 |
| 安卓打包地址与 CSP 下的网页 | 4 组通过，2 次真实 MP3 playing；Chrome 加载与包内一致的网页，安卓系统回调模拟 |
| Release/Debug 编译、Android Lint | 通过；Lint 无问题 |
| APK 签名 | apksigner 验证通过，正式测试签名，Release 未开启 WebView 调试 |
| APK 内容 | 14,665 个网页文件与当前 dist 逐文件哈希一致，14,648 个 MP3，无签名文件混入；见 `artifacts/android/apk-validation.json` |
| npm audit | 0 个已知依赖漏洞，仅指 npm 依赖审计，不能据此声称整个应用没有漏洞 |
| 安卓设备安装与系统能力 | **未完成**：当前电脑缺少模拟器硬件加速，隔离 AVD 的软件模式未能启动；没有连接安卓真机。不能将上面的 Chrome 检查算为原生实测 |

真机仍需验证安装与首屏、横竖屏及系统键盘、两种语速、杀进程后恢复收藏和课程草稿、麦克风授权／拒绝及英语识别、系统文件保存和导出内容。当前 APK 用于这些测试，尚未完成真机验收。

## 实现与权限边界

原前端、词库、学习算法及 `localStorage` 格式复用。AndroidX WebKit 是安卓壳唯一直接运行依赖，用于安全加载本地资源及消息桥；没有增加 npm 依赖。APK 大小主要来自现有双声线录音。

使用 [WebViewAssetLoader](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content) 的 `https://appassets.androidplatform.net/assets/web/index.html` 加载包内页面。文件／content URL 访问关闭，混合内容关闭，未命中的资源直接拒绝。消息桥只允许该固定 origin 的主框架，限定语音操作及 JSON 导出；没有任意文件路径、命令执行或通用 JS 接口。实现参考 [Android 消息桥说明](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge) 和 [系统语音识别接口](https://developer.android.com/reference/android/speech/SpeechRecognizer)。

Manifest 只申请 `RECORD_AUDIO`，不申请存储、联系人、定位或应用联网权限。系统识别服务独立处理声音，应用只保存识别文本；不保存录音。外部页面不能在这个 WebView 中打开。导出通过系统选择器返回的 URI 写文件，网页不能指定设备路径。Release 关闭 WebView 调试和系统自动备份。

## 构建及复核

准备 JDK 17+、Gradle 8.11.1、Android SDK Platform / Build Tools 35。工具链安装在机器本地，路径通过参数传入，不写入源码；本次复用了已有工具链，没有修改全局 Java、SDK、系统驱动或其他项目源码。

```powershell
npx tsc --noEmit
node --test tools/test-native-android.mjs
./scripts/Build-Android.ps1 -SdkPath '<SDK 路径>' -JavaPath '<JDK 路径>' -GradlePath '<gradle.bat 路径>' -InitializeSigning -Validate
python tools/verify_android.py artifacts/android/codewords-1.0.0-release.apk --output artifacts/android/apk-validation.json
# 使用 SDK 的 build-tools/35.0.0/apksigner.bat verify --verbose <apk> 验证签名。
```

脚本默认重新构建网页并校验音频。`-InitializeSigning` 仅首次在 `.runtime/android/codewords-release.jks` 生成签名，配置保存在被忽略的 `android/keystore.properties`；后续沿用，不覆盖密钥。请保留这两个本机文件以支持更新。没有配置签名的 Release 构建会失败，不输出假称可安装的未签名包。`-Validate` 同时编译 Debug 并执行 Release Lint。

APK 与运行时、密钥不进入 Git。产物旁的 `.sha256` 用于传输校验。该文档记录本次验证状态；后续如完成真机测试，应按真实证据更新未完成项。
