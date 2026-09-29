# 非母语英语候选模型筛选（2026-09-25）

用户要求继续寻找准确、低延迟、容忍正确口音、能指出具体错音的免费本机方案。本轮不增加云端调用，不上传用户录音，不修改正式课程或原来的通过阈值。原试读页仍为 `crottc-whisper-word-v2`，不能误认为本轮候选已接入。

**结论：完成四项新增候选实测，仍没有全面达标的替换方案。** WavLM 直接评分减少了部分正确读法的拒绝，但漏检易混音且误报部分专家认可口音；CMUBYE 的音素证据有所改善，仍有错词被转成目标词的风险。后续优先验证多口音训练的 KoelLabs，而不是把本轮任一单词的成功当作课程验收。

## 测试口径

- 复用同一组 24 个公开单词对照（14 正确、10 易混音错误）及 24 段公开成人真人语音（12 专家认可、12 含明显错音），逐段核对既有 SHA256。成人样本的选样规则、13 位说话人及专家分数含义见 `replacement-human-plan.json`。
- 在各自获得授权的 Goodbye、Three 原始录音上本机复测，每段重复 3 次。录音与详细输出仅存已忽略的 `.runtime/pronunciation/private-diagnostic/`，不追加保存其他录音。用户录音没有人工音素标注；不能把“必须放行用户两段录音”当作调参目标，也不能根据模型输出直接断言用户读错。
- 每项另测静音、固定随机噪声、440 Hz 纯音。模型加载与热身不计入响应时间；处理采用 CPU 6 线程，模型一次运行一个。依赖均在现有隔离环境中。
- 下载固定版本并验证发布方权重 SHA256，推理设置离线模式并通过 Python audit hook 阻止 socket 连接与 DNS。新云端费用 0。
- 音素转写模型的“词典精确一致”只表示输出音序列与某个词典变体一致，不是人工校准后的发音正确率。成人句子的转写也不能直接当作经过专家验证的音素诊断。

## 已完成的三项音素模型

| 模型 | 正常单词音序列与词典精确一致 | 错词却输出目标词音序列 | 真人失败录音表现 | 判定 |
|---|---:|---:|---|---|
| Haopeng/CTC_for_IF-MDD | 9/14 | 0/10 | Goodbye 漏掉 /d/；Three 仅输出静音标签 | 不替换现有方案 |
| mrrubino L2-ARCTIC | 8/14 | 1/10 | Goodbye、Three 均未稳定还原目标音序列 | 不替换现有方案 |
| CMUBYE phoneme encoder | 11/14 | 1/10 | Goodbye 三次输出目标音序列；Three 三次输出 `/tɹi/` | 有组件改善，完整评测仍未验证 |

IF-MDD 与 L2-ARCTIC 各完成 48 个公开样本和 6 次既有私人录音复测。短词音素推理约 0.22—0.29 秒；这是音素组件时间，不含录音、解码、独立词识别及网页往返。三类无语音控制均输出空音序列（忽略静音标签）。L2-ARCTIC 把 Guy 的 bed 输出成 `/bæd/`，暴露了错词被声学转写成目标词的风险；IF-MDD 则仍把正常 ship 的元音转写为 `/ɛ/`。没有通过调宽音素相似性来放行。

CMUBYE 同样完成 48 个公开样本和 6 次私人录音复测，单词组件耗时约 0.25 秒；它把 Aria 的 sink 输出成 `/θɪŋk/`，与目标 think 混淆。它用 SpeechOcean 人工感知音素微调，与只按目标文本训练的模型有区别；模型卡明确说独立权重只是音素编码器，完整评分头、对齐与错误解码另在项目中。本轮未跑其完整评分系统，不把编码器结果冒充 CMUBYE 的整体评分能力。

版本及结果：

- `Haopeng/CTC_for_IF-MDD`：`de46aaf5778c5759c003ffa17657176fee772e77`；`ifctc-learner-screening.json`。
- `mrrubino/wav2vec2-large-xlsr-53-l2-arctic-phoneme`：`2f352022fbd7b611acb76b564a7fc3d99abd4d0e`；`l2arctic-learner-screening.json`。
- `Pransfrance/cmubye-phoneme-encoder`：`454fa24e22a19c86bba9e91c2b154ee34779d849`；`cmubye-learner-screening.json`。发布包采用 Transformers 5 格式，包含多余的字符串化特殊 token 元数据。未修改权重或原文件；按发布包的 feature extractor 配置与模型实际 44 个输出 token 构造兼容处理器，并验证每个 token ID 和 CTC 合并结果。未知标签不作为正确音素处理。
- IF-MDD 按官方 `inference.yaml` 构造相同 WavLM、两层 DNN 与 CTC head，严格加载全部 checkpoint；本地构造基础配置避免重新下载基础权重。没有执行模型仓库的任意自定义代码或允许部分权重加载。

## WavLM 直接音素评分

`Jianshu001/wavlm-phoneme-scorer` 更贴近目标任务：发布方提供 WavLM 特征、强制对齐、GOP 和学习到的评分头，返回目标音的错误概率。模型卡称使用 11,601 段儿童英语学习录音及专业标注；这是发布方说明，不能代替成人用户验收。

保持发布方默认错误阈值 **0.70**，不调整评分或对齐逻辑。仅替换为本机严格加载、在内存中解码音频。全部 backbone/head 权重严格匹配；checkpoint 中附带 NumPy 数值指标，仅允许对应数值类型的 weights-only 反序列化。未使用任意对象反序列化。

| 固定样本组 | 标出至少一个错音 | 无错音标记 | 处理耗时中位数 |
|---|---:|---:|---:|
| 正确单词 14 个 | 0 | 14 | 0.521 秒 |
| 错读单词 10 个 | 5 | 5 | 0.521 秒 |
| 专家认可成人读法 12 段 | **3 段误报** | 9 | 1.045 秒 |
| 含明显错音成人录音 12 段 | 10 | 2 | 1.055 秒 |

“含错音录音标出任意错误”不证明具体位置与专家标注一致，不能称为音素级召回率。漏检包含 sheep→ship 两声线、bed→bad 两声线、free→three 的 Guy 声线，错误词仍可能得到 78.5—93.3 分。这说明不能仅凭高总分给用户判通过。

用户 Three 三次均没有错音标记，平均分 81.2、耗时 0.530/0.540/0.542 秒；Goodbye 则三次均将 /d/ 标错、平均分 72.7、耗时 0.654/0.654/0.639 秒。这是候选模型输出，不是人工发音结论。它改善了 Three 的反馈与速度，但不能消除误报及漏报，暂不接入。

静音、噪声、纯音均被模型输出为 Hello 的四个“错音”，说明发布方完整流程还缺少产品需要的无语音拒评；不能把这类结果作为发音纠错展示。完整原始结果保留在 `learned-scorer-screening.json`。

- 评分模型版本：`19f6b9675d02a61dcd5b2aec0fdcc4364c1fc9da`。
- 对齐模型 `facebook/wav2vec2-xlsr-53-espeak-cv-ft`：`2c733782da5604684829819a5eb744c193fe9398`。
- 新增 `g2p-en==2.1.0` 及依赖仅在 `.runtime/pronunciation/mdd-venv/`；NLTK 资源仅在 `.runtime/pronunciation/nltk-data/`。版本快照为 `mdd-environment-learner-screening.txt`，前端依赖不变。

## 其他候选的筛选依据

- **KoelLabs/xlsr-english-01**：多口音英语音素模型，包含 L2-ARCTIC、SpeechOcean 等训练数据。发布方报告约 19% PER，不等于 81% 发音判断准确率。需要登录并同意共享账号联系方式才能下载，尚未获得访问权限；未绕过门槛，未实测。
- **StreamPA**：发布包说明 CPU 前端耗时远大于音频时长，短片段还可能无法评分；官方验证平台为 Ubuntu/WSL2 + Python 3.10。其已公开限制与低延迟短词需求冲突，本轮未安装。
- **HMamba distilled**：只是评分核心，还需 Kaldi GOP 和三套声学特征；原实现依赖 CUDA/Triton，不能把 2.49M 评分头称为整个轻量评测系统。本轮未安装。
- **MDD-LLM Llama 3.2 1B**：存在完整离线权重包，但 CPU 延迟及本机效果尚未验证，亦需进一步核对权重使用条款。本轮只审阅发布材料，未测试，不列为已胜出的替代方案。

## 验证与交付边界

四个报告各有 48 个不重复公开用例 ID，另各保留三个无语音控制结果；用户录音每模型每段重复三次只检查复现稳定性，不代表新增说话人或独立准确率。推理断网、权重完整性和输入哈希检查完成，私人输出确认被 Git 忽略。Python 编译、隔离环境 `pip check`、`npm run verify` 通过。正式 React、安卓、学习记录和本机试读模型均未替换；未做新真人录音或手机验收，提交推送继续暂停。

复现脚本为 `tools/benchmark_learner_phonemes.py --model ifctc|l2arctic|cmubye` 与 `tools/benchmark_learned_pronunciation.py`，默认仅公开样本；只有 `--authorized-private` 才读取两段已逐次授权的本机录音。不要用这些实验输出自动更新用户掌握状态。

来源：[IF-MDD 官方实现](https://github.com/Secondtonumb/IF-MDD)、[L2-ARCTIC 模型](https://huggingface.co/mrrubino/wav2vec2-large-xlsr-53-l2-arctic-phoneme)、[WavLM 评分模型](https://huggingface.co/Jianshu001/wavlm-phoneme-scorer)、[KoelLabs 模型](https://huggingface.co/KoelLabs/xlsr-english-01)、[CMUBYE 模型](https://huggingface.co/Pransfrance/cmubye-phoneme-encoder)、[StreamPA 发布包与限制](https://huggingface.co/faeea/StreamPA)、[HMamba 特征依赖](https://huggingface.co/fuann/hmamba-full-distilled)、[MDD-LLM 发布包](https://huggingface.co/Haopeng/MDD-LLM-Llama3.2-1B-L2-ARCTIC)。
