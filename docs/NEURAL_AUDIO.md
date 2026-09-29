# Aria / Guy 双声线

全站提供 en-US-AriaNeural（女声）和 en-US-GuyNeural（男声），与用户确认的试听样音使用同一声线和正常语速。生成工具为 edge-tts 7.2.8，调用 Edge 在线语音服务；非官方 Azure API 集成。服务可用性不作保证，日常网站点读只读取已生成的静态文件，不依赖生成服务。

每套包含 3,560 个单词、3,560 个例句和一个试听文件，共 7,121 个 MP3。两套合计 14,242 个。目录为 public/audio/aria 和 public/audio/guy。语音设置默认 Aria，偏好保存在 codewords-voice；不修改学习进度键或词汇 ID。

生成：

```powershell
python -m pip install -r tools/requirements-neural.txt
python tools/generate_neural_audio.py --workers 8
```

工具使用临时文件写入、成功后改名，失败重试后报错，可重新运行续传。新生成文件的文本和声线摘要保存在输出目录的 `neural-manifest.json`，相同文本可跳过、文本变化会重生成。没有清单的旧文件默认仍跳过；修改例句时必须使用下面的差异流程。合成语速为原速；正常朗读使用原整段录音，单词慢速保持 0.72 倍并保持音高。多词内容的慢速改为复用单词片段的逐词队列，新增补录单独打包，见 [逐词慢读](WORD_BY_WORD_AUDIO.md)。这不代表全部词汇已通过人工发音审核。

两区课程、复习、词汇／表达库以及练习与结果中的每条可点读内容，都在自己的发音图标／音标旁提供慢速按钮。点击单词、例句或原喇叭固定正常播放；点击旁边的“慢速”以 0.72 倍播放单词，多词内容依次慢读并加入停顿，不必回到页首选择。下一词的普通点读仍是正常速度。教学卡片、听力题、参考发音、口语示范、参考表达与逐词复习结果采用相同操作。页面顶部已撤掉独立语速切换，保留原语音设置入口。

所有音频经 App 的同一播放入口处理，沿用 `codewords-playback-speed` 供既有自动播放和语音设置使用。正常／慢速点击不会重建题目、不清除答案或学习记录。`tools/test-local-audio-controls-browser.mjs` 验证最新逐条操作；`artifacts/audio-speed/` 中顶部全局切换的截图是被本次纠正替代的历史方案。

双速选择参考[多邻国官方听力说明](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-listening-skills/)中的正常播放与慢速按钮。该说明没有提供统一慢速倍数；0.72 是本项目沿用的取值，不宣称与其语音生成方式或倍速相同。

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

## 课程逐词点读与提示音（2026-09-24）

两区课程的讲解、题干、选项、排序词块、填空中可见的文字、跟读示例和解析均支持点击英文单词发音。课程卡片和表达库直接点击英文内容播放单词或整句，旁边仅保留慢速，不另设喇叭图标。讲解等文字逐词点读后只就地提供慢速，再点原词即可正常重听。选项先选中再朗读，排序词块选入时朗读；旁边的慢速只播放，不改变答案。填空中的隐藏答案不进入可点读内容。

听力题首次选择先记录答案，再自动朗读该选项；随后重听或更换英文选项记为使用提示。可选的 `draft.helpSource: 'audio'` 标记让这类点读在刷新后仍保留辅助记录，但不会因此直接显示答案解析。旧草稿继续兼容。口语自查不触发答对音，也不增加独立作答证据。

逐词录音优先复用词库和日常表达已有文件。补充的 288 段单词／词组／选项在 `src/readingAudio.json`，男女声共 576 个 MP3 放在 `public/audio/reading/`，不改变原有词汇 ID 或双声线目录计数。`node scripts/reading-audio-inventory.mjs --write` 从当前课程收集缺口，随后用 `.venv/Scripts/python.exe tools/generate_reading_audio.py` 续传生成，并运行 `python tools/verify_reading_audio.py` 完整解码。构建与完整性检查校验文本、声线及文件哈希；补充录音 URL 带文本版本，避免复用变更前的浏览器缓存。

保留用户此前试听确认的两种提示音：`public/audio/feedback/correct.mp3`（答对）和 `complete.mp3`（结课／完成一轮复习）。配对练习新增自行合成的短音 `pair.mp3`，尚未经过用户试听确认。声音由实际配对、作答、完成动作触发，恢复进度时不触发；同一动作去重；提示音等待朗读结束，等待期间只保留最新提示，切题或退出即取消。后续点读立即接管播放。语音设置中的“练习提示音”独立开关保存在 `codewords-feedback-sound`，不影响点读。新增录音路径在旧安卓壳中沿用网页播放器，原有词库／表达仍优先使用原生播放；真机体验需另行验收。
