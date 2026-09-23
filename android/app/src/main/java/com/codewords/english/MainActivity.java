package com.codewords.english;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;

/** Offline web app with two scoped native capabilities: speech and record export. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/web/index.html";
    private static final int MICROPHONE = 10, EXPORT = 11;
    private static final int MAX_EXPORT_LENGTH = 16 * 1024 * 1024;
    private WebView web;
    private SpeechRecognizer recognizer;
    private String speechId;
    private JavaScriptReplyProxy speechReply;
    private String pendingExport;
    private boolean waitingForPermission;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(250, 250, 247));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        } else root.setFitsSystemWindows(true);
        configureWebView();
        web.loadUrl(START);
    }

    @SuppressWarnings("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebChromeClient(new WebChromeClient());
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !START.equals(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "programming-english-learning-site.pages.dev".equals(uri.getHost())
                        && uri.getPort() == -1 && uri.getUserInfo() == null && "/api/sync".equals(uri.getPath())
                        && uri.getQuery() == null && !request.isForMainFrame()) return null;
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
                        && uri.getPort() == -1 && uri.getUserInfo() == null && uri.getPath() != null
                        && uri.getPath().startsWith("/assets/web/")) {
                    WebResourceResponse response = loader.shouldInterceptRequest(uri);
                    if (response != null) {
                        if ("text/html".equals(response.getMimeType())) response.setResponseHeaders(Collections.singletonMap(
                                "Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src https://programming-english-learning-site.pages.dev/api/sync; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"));
                        return response;
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "CodeWordsNative", Collections.singleton(ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !ORIGIN.equals(origin.toString())) return;
                String data = message.getData();
                if (data == null || data.length() > MAX_EXPORT_LENGTH + 1024) return;
                try { handleMessage(new JSONObject(data), reply); }
                catch (Exception ignored) { Toast.makeText(this, "操作未完成，请重试。", Toast.LENGTH_SHORT).show(); }
            });
        } else {
            new AlertDialog.Builder(this).setTitle("请更新系统 WebView")
                    .setMessage("学习和点读可以使用。语音输入、记录导出需要较新的 Android System WebView，请先从手机应用商店更新。")
                    .setPositiveButton("知道了", null).show();
        }
    }

    private void handleMessage(JSONObject message, JavaScriptReplyProxy reply) throws Exception {
        String action = message.optString("action");
        if ("export".equals(action)) {
            String filename = message.optString("filename"), content = message.optString("content");
            if (!filename.matches("[a-z0-9-]{1,100}\\.json") || content.isEmpty() || content.length() > MAX_EXPORT_LENGTH) return;
            if (pendingExport != null) { Toast.makeText(this, "请先完成当前导出。", Toast.LENGTH_SHORT).show(); return; }
            pendingExport = content;
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json").putExtra(Intent.EXTRA_TITLE, filename);
            try { startActivityForResult(save, EXPORT); }
            catch (Exception error) { pendingExport = null; Toast.makeText(this, "无法打开系统文件保存界面。", Toast.LENGTH_LONG).show(); }
            return;
        }
        String id = message.optString("id");
        if (!id.matches("speech-[0-9]{1,12}")) return;
        if ("speech-start".equals(action)) {
            cancelSpeech(); speechId = id; speechReply = reply;
            if (!SpeechRecognizer.isRecognitionAvailable(this)) { speechError("service-not-allowed"); return; }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                waitingForPermission = true;
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE);
            } else startSpeech(id);
        } else if (id.equals(speechId)) {
            if ("speech-stop".equals(action) && recognizer != null) recognizer.stopListening();
            if ("speech-abort".equals(action)) cancelSpeech();
        }
    }

    private void sendSpeech(String event, String text, String code) {
        if (speechId == null || speechReply == null || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        try {
            JSONObject message = new JSONObject().put("id", speechId).put("event", event);
            if (text != null) message.put("text", text.length() > 2000 ? text.substring(0, 2000) : text);
            if (code != null) message.put("code", code);
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) speechReply.postMessage(message.toString());
        } catch (Exception ignored) { /* A closed document must never receive a fabricated result. */ }
    }

    private void speechError(String code) {
        sendSpeech("error", null, code); sendSpeech("end", null, null); cancelSpeech();
    }

    private void startSpeech(String id) {
        if (!id.equals(speechId)) return;
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                private boolean live() { return id.equals(speechId); }
                @Override public void onReadyForSpeech(Bundle params) { if (live()) { sendSpeech("start", null, null); sendSpeech("audio-start", null, null); } }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rms) { }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { if (live()) sendSpeech("audio-end", null, null); }
                @Override public void onError(int error) {
                    if (!live()) return;
                    String code;
                    switch (error) {
                        case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: code = "not-allowed"; break;
                        case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: case SpeechRecognizer.ERROR_SERVER: code = "network"; break;
                        case SpeechRecognizer.ERROR_AUDIO: code = "audio-capture"; break;
                        case SpeechRecognizer.ERROR_NO_MATCH: case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: code = "no-speech"; break;
                        case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED: case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE: code = "language-not-supported"; break;
                        default: code = "unknown";
                    }
                    speechError(code);
                }
                private String text(Bundle result) {
                    ArrayList<String> matches = result.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    return matches == null || matches.isEmpty() ? "" : matches.get(0);
                }
                @Override public void onResults(Bundle results) {
                    if (!live()) return;
                    String transcript = text(results);
                    if (transcript.trim().isEmpty()) { speechError("no-speech"); return; }
                    sendSpeech("result", transcript, null); sendSpeech("end", null, null); cancelSpeech();
                }
                @Override public void onPartialResults(Bundle results) { if (live()) sendSpeech("partial", text(results), null); }
                @Override public void onEvent(int eventType, Bundle params) { }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        } catch (SecurityException error) { speechError("not-allowed"); }
        catch (Exception error) { speechError("service-not-allowed"); }
    }

    private void cancelSpeech() {
        speechId = null; speechReply = null;
        if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); recognizer = null; }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != MICROPHONE) return;
        waitingForPermission = false;
        if (speechId == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startSpeech(speechId);
        else speechError("not-allowed");
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != EXPORT) return;
        String content = pendingExport;
        pendingExport = null;
        if (result != RESULT_OK || data == null || data.getData() == null || content == null) return;
        Uri destination = data.getData();
        new Thread(() -> {
            String notice;
            try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                if (output == null) throw new java.io.IOException("No output");
                output.write(content.getBytes(StandardCharsets.UTF_8));
                notice = "学习记录已导出。";
            } catch (Exception error) { notice = "导出失败，原学习记录仍保留，请重试。"; }
            final String message = notice;
            runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
        }, "record-export").start();
    }

    @Override public void onBackPressed() {
        new AlertDialog.Builder(this).setTitle("退出 CodeWords？")
                .setMessage("本机学习记录会保留。")
                .setNegativeButton("继续学习", null).setPositiveButton("退出", (dialog, which) -> finish()).show();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onPause() { if (web != null && !waitingForPermission) web.onPause(); super.onPause(); }
    @Override protected void onStop() { cancelSpeech(); super.onStop(); }
    @Override protected void onDestroy() { cancelSpeech(); if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
