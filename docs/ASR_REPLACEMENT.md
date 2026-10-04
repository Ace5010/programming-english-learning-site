# 跟读识别替代筛选

2026-10-04。用户反馈现有跟读几乎没有正确识别，认为需要换模型。本轮在现有 `main` 上筛选本机候选并提供试用，随后按用户“那你直接用就可以了”的明确授权，将本机正式课程默认识别替换为 **Qwen3-ASR-1.7B**。

## 结果与选择

正式选择是 **Qwen3-ASR-1.7B**。这组公开样本中它优于另外三项，但与 SenseVoice 的差距较小，不能宣称已解决用户的口音或麦克风问题。

| 本机配置 | 新增成人句子完全一致 | 词错误率 | 成人句子模型计算中位 | 课程示范句子 | 易混短词 |
| --- | --- | --- | --- | --- | --- |
| SenseVoiceSmall，FP32 ONNX | 20/24 | 3.45%（6/174） | 0.131 秒 | 24/24 | 7/8 |
| Whisper small，CPU int8 | 14/24 | 12.64%（22/174） | 1.354 秒 | 24/24 | 8/8 |
| Whisper large-v3，CPU int8 | 18/24 | 5.17%（9/174） | 5.567 秒 | 24/24 | 8/8 |
| Qwen3-ASR-1.7B，CPU FP32 | 21/24 | 2.30%（4/174） | 4.369 秒 | 24/24 | 8/8 |

这些是当前可用部署配置的结果，不是所有精度或硬件设置下的模型排名。时间不含用户录音、文件解码、首次加载和浏览器等待。Qwen 的课程句子中位约 2.8–3.2 秒；较长成人句子实际有约 5.8 秒的请求。

SenseVoice 再次将公开标准 `tree` 音频转写成 `three`。Qwen 在该输入上正确，但新增成人组仍出现 then→that、desk→disc 等差异。数据集原文也有非标准拼写或语法；完全匹配和词错误率不等于独立的发音判断。

## 固定样本与边界

每个模型使用同一份 56 个公开音频输入：两套声音各 6 个日常句子、6 个编程句子和 4 个易混短词，以及 24 个新增成人真人句子。成人组取自公开 [speechocean762](https://github.com/jimbozhang/speechocean762)，固定 revision 为 `613968e3b0b789fc33936fb5eba1973176ba7d11`；按 test ID 排序，年龄至少 18 岁，总体 accuracy 至少 8，所有 phone score 至少 1，每人最多 2 句，排除之前筛选所用的所有说话者。本轮成人组共 12 人。

先冻结选择，再运行模型；新增公开 WAV 与已缓存 Git tree 的 blob SHA1 对照，全部输入保存 SHA256。推理时再次核对文件，全部使用相同 16 kHz 解码和已有 Silero 语音检测门槛。静音、噪声、纯音三项控制均被该门槛拒绝；这些控制没有进入文字模型。参考句、题目答案、热词和候选词列表不送入识别器。

文字统计归一化大小写、标点、常见缩写和 0–20 的数字写法。Whisper 的 `3` 与 `three` 按同一表示计分；原始转写保留。数字表示修订后只重新统计已保存输出，没有重跑推理或改选样本。所有模型缓存和非母语 WAV 均在原有忽略目录内。未使用或保存用户私人录音，云端推理调用和新增费用均为 0。

结果文件位于 [artifacts/asr-replacement-20261004](../artifacts/asr-replacement-20261004/)：`plan.json`、`sensevoice.json`、`whisper-small.json`、`whisper-large-v3.json`、`qwen.json`。计划保存来源、选择规则、文件哈希和完整输出。

## 正式课程接入

打开原网站 **http://localhost:5186/** 即可使用。`src/localQwen.ts` 校验正式服务的 Qwen 引擎身份，课程界面显示“使用本机 Qwen3-ASR 识别”。`scripts/Open-LocalSite.ps1` 默认启动 `--engine qwen --port 18768`，继续复用原 Python 环境、模型缓存和 loopback 接口；不下载新依赖、不使用 API Key。

启动器先打开网站，随后加载本机模型；课程会在首分钟内重试发现服务，模型就绪后自动接入。Qwen 录音最多 18 秒，停止后的处理等待上限由旧 8 秒增至 30 秒；取消、离开、后台隐藏和晚到结果保护沿用现有实现。本机服务断开时重新发现启动令牌，界面提示重新运行启动入口。本机 Qwen 不可用时，原设备／浏览器识别路径仍可使用，界面按实际识别来源说明；安卓继续使用系统识别。

两区继续通过相同课程接口提交录音，只有音频进入模型；参考句和答案不发送。原始转写、来源和尝试次数按现有格式保存，不改学习算法、容错规则、存储键、同步或长期复习准入。录音只在内存中处理，不保存。模型的 `qwen3-asr-trial-v1` 协议标识保留，以对应已经验证的同一后端版本；该标识不表示正式课程仍在使用 SenseVoice。

切换前核对两张课程页和试用页均没有收音，18768 与 18769 的健康状态均无处理任务，且命令行身份分别是原 SenseVoice 与本轮 Qwen。仅停止这两个识别进程，原网站服务保持运行。新版启动器已在 18768 启动 Qwen，并再次验证启动会复用该进程。

## 独立试用入口

正式识别服务仍提供 **http://127.0.0.1:18768/** 试用入口，引擎 `qwen3-asr-trial-v1`。默认展示“你叫什么名字？”及原有正常／慢速示范，可选择更多熟悉词和课程短句，也可直接读之前识别失败的句子并核对原始转写。页面本身不写课程进度。此前独立 18769 进程已停止，避免重复加载模型。

沿用既有本机解码、语音门槛和录音页面；Qwen 后端使用已经缓存且校验哈希的官方模型和 `qwen-asr==0.0.6` Transformers backend。模型以空 context、固定 English、确定性解码运行。超长截断输出不采用；试用页最多录音 18 秒、处理超时 30 秒，提供取消、音量和内存中的回听。页面显示转写，不给发音分数，不写课程记录。

服务仅监听 loopback；音频资源由固定白名单返回，短句 URL 编码并核对规范路径。Host、Origin、一次启动令牌及请求大小限制沿用原服务。

再次启动试用服务：

```powershell
& '.runtime/pronunciation/mdd-venv/Scripts/python.exe' tools/serve_pronunciation_lab.py --engine qwen --port 18769
```

运行前核对端口身份，不强行停止占用者。首次复合启动命令被执行工具以 `blocked by policy` 拒绝，具体规则未给出；随后检查无新监听或输出文件，确认该命令未产生副作用。改用工具管理的单独前台服务命令后已成功启动并核对健康状态，无权限升级或进程中断。

## 实际验证

- 四个模型完成相同 56 个公开输入和 3 类语音门槛控制。Python 源码语法检查通过。
- `node tools/test-qwen-asr-lab-browser.mjs` 通过：公开 `What's your name?` 音频 → Chrome 真正的 MediaRecorder → 实际本机 Qwen → 原始转写，服务端约 3.24 秒；没有模拟接口结果。同时核对示范音频、0.72 倍慢速保持音高、示范与收音互停、回听、320/390/1280 像素布局、静音拒绝、无效音频和令牌拒绝。
- 目标 Tree、实际播放 Three 的 API 对照仍转写 Three，并返回 `matched: false`；目标文本没有改写听到的词。
- 首次手机冒烟发现短句下拉框横向溢出，已限制其宽度；最终上述三种宽度复测通过。
- `node tools/test-sensevoice-lab-browser.mjs` 回归通过：公开 Goodbye 经真实录音编码和原本机服务返回 goodbye，原示范及布局行为正常。
- 正式接入后，`CODEWORDS_REAL_QWEN=1 node tools/test-qwen-course-browser.mjs` 通过：公开 Goodbye、What's your name? 和 Please check my pull request. 经真实 Chrome MediaRecorder → 正式 18768 Qwen → 日常／编程课程回填 → 刷新恢复。模型及解码耗时分别为 2679、3395、3472 ms；没有模拟接口，保存原始标点及大小写、来源和一次尝试，未自动交卷或准入复习。390px 无横向溢出，独立测试数据没有写入用户浏览器。
- 同脚本的默认模拟检查通过：页面初始两次探测模型未就绪，随后自动接入；延迟 9.2 秒的结果仍可回填并保存，覆盖旧 8 秒限制。`tools/test-daily-speech-browser.mjs` 的 9 个异常／取消生命周期场景回归通过。
- `npx tsc --noEmit`、73 项课程／进度／口语 Node 回归、生产构建及 `npm run verify` 通过：3,620 个词、现用双声线各 7,241 个音频、旧 Piper 7,122 个以及日常/基础/音标/阅读资源完整。构建保留原单包大于 500 KB 的提示。
- `tools/test-local-launcher.ps1` 通过隔离的冷启动、并发启动、重复复用、端口身份与冲突保护；实际入口 `-CheckOnly` 核验已运行 Qwen 可复用且原网站不重启。没有创建分支、提交、推送或发布。

公开试用链路结果在 [trial-browser.json](../artifacts/asr-replacement-20261004/trial-browser.json)，正式课程结果在 [course-browser.json](../artifacts/asr-replacement-20261004/course-browser.json)，启动延迟／处理延迟模拟结果在 [course-browser-stub.json](../artifacts/asr-replacement-20261004/course-browser-stub.json)，截图均在同目录。本轮没有用户真实麦克风、Android、已部署页面或真人学习效果验收；正式替换依据用户明确授权，效果边界保留。

官方依据：[Qwen3-ASR 源码及推理说明](https://github.com/QwenLM/Qwen3-ASR)、[官方模型页](https://huggingface.co/Qwen/Qwen3-ASR-1.7B)。加载时仍显示本地 Transformers 的 Mistral regex 提示：本机代码会对该版本的本地非 Mistral 配置进入通用检测，而实际 tokenizer 配置为 Qwen2Tokenizer。本轮保留官方 Qwen 分词器与预处理，没有按该提示套用另一模型的正则或改写权重；全部上述结果均为原配置实测。
