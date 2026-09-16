# Aria / Guy 双声线

全站提供 en-US-AriaNeural（女声）和 en-US-GuyNeural（男声），与用户确认的试听样音使用同一声线和正常语速。生成工具为 edge-tts 7.2.8，调用 Edge 在线语音服务；非官方 Azure API 集成。服务可用性不作保证，日常网站点读只读取已生成的静态文件，不依赖生成服务。

每套包含 3,560 个单词、3,560 个例句和一个试听文件，共 7,121 个 MP3。两套合计 14,242 个。目录为 public/audio/aria 和 public/audio/guy。语音设置默认 Aria，偏好保存在 codewords-voice；不修改学习进度键或词汇 ID。

生成：

```powershell
python -m pip install -r tools/requirements-neural.txt
python tools/generate_neural_audio.py --workers 8
```

工具使用临时文件写入、成功后改名，失败重试后报错，可重新运行续传。新生成文件的文本和声线摘要保存在输出目录的 `neural-manifest.json`，相同文本可跳过、文本变化会重生成。没有清单的旧文件默认仍跳过；修改例句时必须使用下面的差异流程。合成语速为原速；卡片的慢速在语音设置中选择，使用 0.72 倍播放速率并保持音高，复习练习仍提供单独慢速入口。语速偏好保存在 `codewords-playback-speed`。没有改写目标词拼写来强行控制读音，也不代表全部词汇已通过人工发音审核。

## 更新例句与录音

例句优先使用 `scripts/simple-examples.txt` 中人工编写的中英短句；其余基础词从同一词条的原始资料中选择较短、支持词较常见的完整句。`scripts/example-selection.mjs` 的评分只是编辑辅助规则，不代表正式英语等级认证。它会清除不影响目标词的词典括号释义，不删除句子的普通成分。

先保留旧词库，再生成候选文本和录音到暂存目录。这样用户不会先看到新句子、却听到旧录音：

```powershell
Copy-Item src/vocabulary.ts .venv/vocabulary-before.ts
# 修改 simple-examples.txt 等例句来源后：
node scripts/build-vocabulary.mjs --output .venv/vocabulary-next.ts
.venv/Scripts/python.exe tools/generate_neural_audio.py --source .venv/vocabulary-next.ts --changed-from .venv/vocabulary-before.ts --output-dir .venv/audio-update --workers 8
```

`--changed-from` 比较固定 ID 的单词和例句文本，只更新发生变化的对应音频；中文翻译的变化不会单独触发合成。失败可原样续跑，文本摘要可避免错误复用暂存目录的旧录音。`--only-ids 44` 可用于单词级试听检查，`--dry-run` 可查看待处理数量。

确认两个声线都生成完毕、MP3 可解码、录音清单文本与候选词库一致后，再复制变化的 MP3 到 `public/audio/aria/` 和 `public/audio/guy/`，合并 `neural-manifest.json`，最后替换 `src/vocabulary.ts`。同时确认词数、固定 ID、单词、释义、分类、音标与级别没有意外变化。页面的例句音频 URL 带文本版本参数，避免旧浏览器缓存播放旧例句。

完成后运行 `npx tsc --noEmit`、`npm run verify`、`npm run build`，进行单词/例句点读和复习回归检查。旧 Piper 文件不参与本次例句更新，不能当作新版例句录音使用。

`npm run build` 构建后验证双声线完整性，再仅从 dist 删除旧 Piper 副本，以控制 Cloudflare Pages 部署文件数。public/audio/piper-lessac 和原生成工具保留供回溯。npm run verify 同时检查旧音频基线与新双声线。

来源：https://github.com/rany2/edge-tts
