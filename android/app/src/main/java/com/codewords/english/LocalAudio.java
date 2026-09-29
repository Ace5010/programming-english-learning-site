package com.codewords.english;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import org.json.JSONArray;

/** Only plays bundled recordings; no URLs, arbitrary files, or microphone access. */
final class LocalAudio {
    private final Context context;
    private final AudioManager manager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    private MediaPlayer player;
    private AudioFocusRequest focus;
    private JavaScriptReplyProxy reply;
    private String id;
    private float rate;
    private long requestedAt, lastAdvanceAt;
    private int lastPosition;
    private boolean prepared, started, foreground = true;
    private JSONArray queue;
    private int clipIndex, completedPosition;
    private int clipStart, clipEnd = -1, clipPause;
    private long lastEmitAt;
    private final Runnable nextClip = this::prepareClip;
    private final Runnable timeout = () -> finish("error", "prepare-timeout");
    private final Runnable monitor = new Runnable() {
        @Override public void run() {
            MediaPlayer media = player;
            if (media == null || !prepared) return;
            try {
                int position = media.getCurrentPosition();
                long now = SystemClock.elapsedRealtime();
                if (queue != null && position >= clipEnd) { completeClip(); return; }
                if (position > lastPosition) {
                    lastPosition = position; lastAdvanceAt = now;
                    if (!started || now - lastEmitAt >= 200) {
                        emit(started ? "progress" : "playing", null); started = true; lastEmitAt = now;
                    }
                } else if (now - lastAdvanceAt >= 2000) {
                    finish("error", "playback-stalled"); return;
                }
                handler.postDelayed(this, queue == null ? 200 : 15);
            } catch (RuntimeException error) { finish("error", "playback-state"); }
        }
    };

    LocalAudio(Context context) {
        this.context = context;
        manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }
    void message(JSONObject message, JavaScriptReplyProxy response) {
        String action = message.optString("action"), requestId = message.optString("id");
        if (!requestId.matches("audio-[0-9]{1,12}")) return;
        double requestedRate = message.optDouble("rate", 1);
        if ("queue".equals(action)) {
            JSONArray incoming = message.optJSONArray("clips");
            if (incoming == null || incoming.length() < 1 || incoming.length() > 256 || !validRate(requestedRate)) return;
            String voice = null;
            for (int i = 0; i < incoming.length(); i++) {
                JSONObject clip = incoming.optJSONObject(i);
                if (clip == null || !validPath(clip.optString("path"))) return;
                String currentVoice = clip.optString("path").contains("/aria/") ? "aria" : "guy";
                if (voice != null && !voice.equals(currentVoice)) return;
                voice = currentVoice;
                double start = clip.optDouble("startMs", -1), end = clip.optDouble("endMs", -1), pause = clip.optDouble("pauseMs", -1);
                if (!Double.isFinite(start) || !Double.isFinite(end) || !Double.isFinite(pause) || start < 0 || end <= start || end > 600000 || end-start > 30000 || pause < 0 || pause > 550) return;
            }
            finish("stopped", null);
            id = requestId; reply = response; rate = (float) requestedRate; requestedAt = SystemClock.elapsedRealtime();
            queue = incoming; clipIndex = 0; completedPosition = 0;
            if (!foreground) { finish("stopped", null); return; }
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes).setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener(change -> { if (change < 0 && requestId.equals(id)) finish("stopped", "focus-loss"); }, handler).build();
            if (manager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { finish("error", "focus-denied"); return; }
            Log.i("CodeWordsAudio", "queue " + id + " clips=" + queue.length() + " rate=" + rate);
            prepareClip();
        } else if ("play".equals(action)) {
            String path = message.optString("path");
            if (!validPath(path) || !validRate(requestedRate)) return;
            finish("stopped", null);
            id = requestId; reply = response; rate = (float) requestedRate; requestedAt = SystemClock.elapsedRealtime();
            if (!foreground) { finish("stopped", null); return; }
            Log.i("CodeWordsAudio", "play " + id + " " + path + " rate=" + rate);
            try {
                MediaPlayer candidate = new MediaPlayer();
                player = candidate;
                candidate.setAudioAttributes(attributes);
                try (AssetFileDescriptor file = context.getAssets().openFd("web/" + path)) {
                    candidate.setDataSource(file.getFileDescriptor(), file.getStartOffset(), file.getLength());
                }
                candidate.setOnErrorListener((media, what, extra) -> {
                    if (player == media) finish("error", "decoder-" + what + "-" + extra);
                    return true;
                });
                candidate.setOnCompletionListener(media -> { if (player == media) finish("ended", null); });
                candidate.setOnPreparedListener(media -> {
                    if (player != media) return;
                    handler.removeCallbacks(timeout); prepared = true;
                    try {
                        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                            .setAudioAttributes(attributes).setWillPauseWhenDucked(true)
                            .setOnAudioFocusChangeListener(change -> { if (change < 0 && player == media) finish("stopped", "focus-loss"); }, handler).build();
                        if (manager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                            finish("error", "focus-denied"); return;
                        }
                        // Normal speed uses the default path. On a prepared MediaPlayer,
                        // nonzero setPlaybackParams itself starts playback: do not start twice.
                        if (rate == 1f) media.start();
                        else media.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1f));
                        lastPosition = 0; lastAdvanceAt = SystemClock.elapsedRealtime();
                        handler.post(monitor);
                    } catch (RuntimeException error) { finish("error", "start-failed"); }
                });
                handler.postDelayed(timeout, 3500);
                candidate.prepareAsync();
            } catch (Exception error) { finish("error", "asset-unavailable"); }
        } else if (requestId.equals(id)) {
            if ("stop".equals(action)) finish("stopped", null);
            else if ("rate".equals(action) && validRate(requestedRate)) {
                if (queue != null && rate != (float) requestedRate) { finish("stopped", null); return; }
                rate = (float) requestedRate;
                if (prepared) try {
                    player.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1f));
                } catch (RuntimeException error) { finish("error", "rate-failed"); }
            }
        }
    }
    private static boolean validPath(String path) {
        return path.length() <= 160 && path.matches("audio/((daily|reading|foundation|slow)/)?(aria|guy)/[a-z0-9-]+\\.mp3");
    }
    private void prepareClip() {
        if (id == null || queue == null || !foreground) return;
        JSONObject clip = queue.optJSONObject(clipIndex);
        clipStart = clip.optInt("startMs"); clipEnd = clip.optInt("endMs"); clipPause = clip.optInt("pauseMs");
        try {
            MediaPlayer candidate = new MediaPlayer(); player = candidate; prepared = false; started = false;
            candidate.setAudioAttributes(attributes);
            try (AssetFileDescriptor file = context.getAssets().openFd("web/" + clip.optString("path"))) {
                candidate.setDataSource(file.getFileDescriptor(), file.getStartOffset(), file.getLength());
            }
            candidate.setOnErrorListener((media, what, extra) -> { if (player == media) finish("error", "decoder-" + what + "-" + extra); return true; });
            candidate.setOnCompletionListener(media -> {
                if (player != media) return;
                if (media.getCurrentPosition() + 80 < clipEnd) finish("error", "truncated-clip"); else completeClip();
            });
            candidate.setOnPreparedListener(media -> {
                if (player != media) return;
                if (clipEnd > media.getDuration() + 80) { finish("error", "invalid-bounds"); return; }
                if (clipStart > 0) {
                    media.setOnSeekCompleteListener(seeked -> { if (player == seeked) startClip(seeked); });
                    media.seekTo(clipStart, MediaPlayer.SEEK_CLOSEST);
                } else startClip(media);
            });
            handler.postDelayed(timeout, 3500); candidate.prepareAsync();
        } catch (Exception error) { finish("error", "asset-unavailable"); }
    }
    private void startClip(MediaPlayer media) {
        handler.removeCallbacks(timeout); prepared = true;
        try {
            if (rate == 1f) media.start();
            else media.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1f));
            lastPosition = clipStart; lastAdvanceAt = SystemClock.elapsedRealtime(); handler.post(monitor);
        } catch (RuntimeException error) { finish("error", "start-failed"); }
    }
    private void completeClip() {
        if (queue == null || player == null) return;
        if (clipIndex + 1 == queue.length()) { finish("ended", null); return; }
        handler.removeCallbacks(monitor); handler.removeCallbacks(timeout);
        MediaPlayer previous = player; player = null; prepared = false; previous.release();
        lastPosition = clipEnd; emit("gap", null);
        completedPosition += clipEnd - clipStart; clipIndex++;
        handler.postDelayed(nextClip, clipPause);
    }
    private static boolean validRate(double rate) { return rate == 1 || rate == 0.72; }
    private void emit(String event, String code) {
        if (id == null || reply == null) return;
        try {
            int position = lastPosition;
            // An Error-state query may throw; never let it swallow the error reply itself.
            if (prepared && player != null) try { position = player.getCurrentPosition(); } catch (RuntimeException ignored) { }
            if (queue != null) position = completedPosition + Math.max(0, position - clipStart);
            JSONObject message = new JSONObject().put("id", id).put("event", event).put("positionMs", position);
            if (queue != null) message.put("clipIndex", clipIndex);
            if (code != null) message.put("code", code);
            Log.i("CodeWordsAudio", event + " " + id + " elapsed_ms=" + (SystemClock.elapsedRealtime() - requestedAt)
                    + " position_ms=" + position + " clip=" + clipIndex + " rate=" + rate + (code == null ? "" : " code=" + code));
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(message.toString());
        } catch (Exception ignored) { /* The document may already have closed. */ }
    }
    private void finish(String event, String code) {
        emit(event, code);
        handler.removeCallbacks(timeout);
        handler.removeCallbacks(monitor);
        handler.removeCallbacks(nextClip); queue = null; clipIndex = 0; completedPosition = 0;
        id = null; reply = null; prepared = false; started = false; lastPosition = 0;
        MediaPlayer previous = player; player = null;
        if (previous != null) previous.release();
        if (focus != null) { manager.abandonAudioFocusRequest(focus); focus = null; }
    }
    void foreground(boolean value) { foreground = value; if (!value) finish("stopped", null); }
    void close() { foreground(false); }
}
