// Test helper: native recognizer and native result events, synthetic course audio.
// Call installNativeSpeechInput before navigation, then prepareNativeSpeechInput
// before the UI's Start speaking click. Never opens the physical microphone.
export async function installNativeSpeechInput(page) {
  await page.addInitScript(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const nativeStart = Recognition.prototype.start;
    const nativeStop = Recognition.prototype.stop;
    window.__nativeSpeechEvidence = [];
    Recognition.prototype.start = function () {
      const input = window.__nativeSpeechInput;
      if (!input || input.used) throw new DOMException('Prepare a fresh synthetic audio input first.', 'InvalidStateError');
      input.used = true;
      const evidence = { id: input.id, startedAt: Date.now(), events: [] };
      window.__nativeSpeechEvidence.push(evidence);
      let stopTimer;
      for (const type of ['start', 'audiostart', 'speechstart', 'speechend', 'audioend', 'result', 'error', 'end']) {
        this.addEventListener(type, event => {
          const item = { type, elapsedMs: Date.now() - evidence.startedAt };
          if (type === 'error') { item.error = event.error; item.message = event.message; }
          if (type === 'result') item.results = Array.from(event.results, result => ({ final: result.isFinal, transcript: result[0].transcript, confidence: result[0].confidence }));
          evidence.events.push(item);
        });
      }
      this.addEventListener('end', () => {
        clearTimeout(stopTimer);
        try { input.source.stop(); } catch {}
        input.stream.getTracks().forEach(track => track.stop());
        input.context.close();
      }, { once: true });
      nativeStart.call(this, input.track);
      input.source.start();
      stopTimer = setTimeout(() => { try { nativeStop.call(this); } catch {} }, Math.ceil(input.duration * 1000) + 100);
    };
  });
}

export async function prepareNativeSpeechInput(page, id, voice = 'aria') {
  await page.evaluate(async ({ id, voice }) => {
    const old = window.__nativeSpeechInput;
    if (old) {
      try { old.source.stop(); } catch {}
      old.stream.getTracks().forEach(track => track.stop());
      if (old.context.state !== 'closed') await old.context.close();
    }
    const context = new AudioContext();
    const response = await fetch(`/audio/daily/${voice}/${id}.mp3`);
    if (!response.ok) throw new Error(`Missing synthetic course input: ${id}`);
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    const buffer = context.createBuffer(decoded.numberOfChannels, decoded.length + Math.ceil(decoded.sampleRate * 2), decoded.sampleRate);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) buffer.getChannelData(channel).set(decoded.getChannelData(channel), Math.ceil(decoded.sampleRate * .5));
    const source = context.createBufferSource(); source.buffer = buffer;
    const destination = context.createMediaStreamDestination(); source.connect(destination);
    await context.resume();
    window.__nativeSpeechInput = { id, context, source, stream: destination.stream, track: destination.stream.getAudioTracks()[0], duration: buffer.duration, used: false };
  }, { id, voice });
}
