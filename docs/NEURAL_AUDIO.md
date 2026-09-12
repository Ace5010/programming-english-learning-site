# Aria / Guy 双声线

全站提供 en-US-AriaNeural（女声）和 en-US-GuyNeural（男声），与用户确认的试听样音使用同一声线和正常语速。生成工具为 edge-tts 7.2.8，调用 Edge 在线语音服务；非官方 Azure API 集成。服务可用性不作保证，日常网站点读只读取已生成的静态文件，不依赖生成服务。

每套包含 3,560 个单词、3,560 个例句和一个试听文件，共 7,121 个 MP3。两套合计 14,242 个。目录为 public/audio/aria 和 public/audio/guy。语音设置默认 Aria，偏好保存在 codewords-voice；不修改学习进度键或词汇 ID。

生成：

```powershell
python -m pip install -r tools/requirements-neural.txt
python tools/generate_neural_audio.py --workers 8
```

工具跳过已存在的非空 MP3，使用临时文件写入、成功后改名，失败重试后报错，可重新运行续传。合成语速为原速；页面慢速按钮使用 0.72 倍播放速率并保持音高。没有批量改写单词拼写来强行控制读音，也不代表全部词汇已通过人工发音审核。

`npm run build` 构建后验证双声线完整性，再仅从 dist 删除旧 Piper 副本，以控制 Cloudflare Pages 部署文件数。public/audio/piper-lessac 和原生成工具保留供回溯。npm run verify 同时检查旧音频基线与新双声线。

来源：https://github.com/rany2/edge-tts
