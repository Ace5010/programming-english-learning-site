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
    private long requestedAt;
    private boolean prepared, foreground = true;
    private final Runnable timeout = () -> finish("error", "prepare-timeout");

    LocalAudio(Context context) {
        this.context = context;
        manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }
    void message(JSONObject message, JavaScriptReplyProxy response) {
        String action = message.optString("action"), requestId = message.optString("id");
        if (!requestId.matches("audio-[0-9]{1,12}")) return;
        double requestedRate = message.optDouble("rate", 1);
        if ("play".equals(action)) {
            String path = message.optString("path");
            if (path.length() > 160 || !path.matches("audio/(daily/)?(aria|guy)/[a-z0-9-]+\\.mp3") || !validRate(requestedRate)) return;
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
                    focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                            .setAudioAttributes(attributes).setWillPauseWhenDucked(true)
                            .setOnAudioFocusChangeListener(change -> { if (change < 0 && player == media) finish("stopped", "focus-loss"); }, handler).build();
                    if (manager.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                        finish("error", "focus-denied"); return;
                    }
                    try {
                        media.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1f));
                        media.start();
                        emit("playing", null);
                    } catch (RuntimeException error) { finish("error", "start-failed"); }
                });
                handler.postDelayed(timeout, 3500);
                candidate.prepareAsync();
            } catch (Exception error) { finish("error", "asset-unavailable"); }
        } else if (requestId.equals(id)) {
            if ("stop".equals(action)) finish("stopped", null);
            else if ("rate".equals(action) && validRate(requestedRate)) {
                rate = (float) requestedRate;
                if (prepared) try {
                    player.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(1f));
                    emit("playing", null);
                } catch (RuntimeException error) { finish("error", "rate-failed"); }
            }
        }
    }
    private static boolean validRate(double rate) { return rate == 1 || rate == 0.72; }
    private void emit(String event, String code) {
        if (id == null || reply == null) return;
        try {
            int position = prepared && player != null ? player.getCurrentPosition() : 0;
            JSONObject message = new JSONObject().put("id", id).put("event", event);
            if (code != null) message.put("code", code);
            Log.i("CodeWordsAudio", event + " " + id + " elapsed_ms=" + (SystemClock.elapsedRealtime() - requestedAt)
                    + " position_ms=" + position + " rate=" + rate + (code == null ? "" : " code=" + code));
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(message.toString());
        } catch (Exception ignored) { /* The document may already have closed. */ }
    }
    private void finish(String event, String code) {
        emit(event, code);
        handler.removeCallbacks(timeout);
        id = null; reply = null; prepared = false;
        MediaPlayer previous = player; player = null;
        if (previous != null) previous.release();
        if (focus != null) { manager.abandonAudioFocusRequest(focus); focus = null; }
    }
    void foreground(boolean value) { foreground = value; if (!value) finish("stopped", null); }
    void close() { foreground(false); }
}
