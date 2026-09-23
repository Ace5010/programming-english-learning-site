# 常用编程词汇补充

2026-09-22：在原有 3,560 词的基础上追加 60 词，当前共 3,620 词。检查重点是 GitHub 页面、代码、文件操作、命令行、配置和常见错误信息，不扩充专业长尾术语。

原有全部词条和 ID 保留。旧掌握记录、收藏和复习记录仍指向同一单词，不需要重新编号或迁移。

## 新增内容

| 使用场景 | 新增词 |
| --- | --- |
| 代码基础 | code、source、null、undefined、false、const、import、export、async、await、item、length、parse、initialize |
| 文件操作 | load、delete、remove、rename、format |
| 命令行和配置 | execute、update、enable、disable、config、default、option、setup、exit、console、configure、production、setting |
| GitHub 和版本控制 | status、diff、version |
| 测试与报错 | log、missing、failed、retry、timeout、valid、invalid、pending |
| 网络与权限 | client、download、upload、link、denied、username |
| 页面与文档 | required、optional、preview、description、select、submit、confirm、refresh、reload、document、render |

完整数据在 `scripts/vocabulary-expansion.json`，新增 ID 固定为 3561—3620。这里的常用程度来自对实际操作场景的编辑筛选，不是词频排名。

## 原有词条修正

22 个旧词补充或修正技术语境释义：project、main、fail、pass、fix、print、open、close、found、shell、fetch、set、type、port、change、message、read、write、true、let、input、output。

其中 17 条英文例句同步换成简短、完整的技术语境句子。例如：

- project：`Open this project.`
- main：`Switch to the main branch.`
- fail / pass：`This test may fail.` / `This test should pass.`
- fix：`Fix this error.`
- message：`Write a commit message.`

仅修改中文释义的 read、write、true、let、type 保留原例句和录音。

## ID 与生成规则

`scripts/vocabulary-baseline.json` 锁定原有 3,560 个 ID 与单词。生成器按身份清单匹配原始资料，不再用来源顺序重新分配旧 ID；补充词在 `vocabulary-expansion.json` 中显式指定新 ID 并追加。释义和例句修正也以固定 ID 与单词共同定位。

```powershell
node scripts/build-vocabulary.mjs --output .venv/vocabulary-next.ts
```

新增和修改例句时继续使用 `docs/NEURAL_AUDIO.md` 中的候选词库、差异生成、先验证音频再替换文本流程，不使用只跳过已有文件的方式更新旧录音。

## 音频与检查

- Aria / Guy 各 7,241 个 MP3：3,620 个单词、3,620 个例句、1 个试听。
- 新增 240 个录音，更新 34 个例句录音，合计 274 个；全部完成 FFmpeg 完整解码检查。
- 新增和更新录音的清单保存声线、文本、文本摘要及 MP3 文件 SHA-256；`verify` 和生产构建检查清单与词库、文件一致。
- 原 Piper 7,122 个 MP3 冻结保留，不为补充词生成旧声线；网页继续使用 Aria / Guy。
- 重新生成的词库与交付词库字节一致，原 3,560 个 ID 与单词保持不变；`npm run verify` 通过，缺失或零字节录音为 0。

自动解码证明文件可完整读取，不代表每个词都经过人工发音审核。
