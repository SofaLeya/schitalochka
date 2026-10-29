package io.github.sofaleya.schitalochka;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends Activity {

    private static final String START_URL = "https://sofaleya.github.io/schitalochka/";
    private static final String HOST = "sofaleya.github.io";
    private static final int FILE_REQ = 41;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    // Подменяет navigator.share и скачивание blob-файлов: в WebView их нет,
    // поэтому копии и выгрузки уходят в обычное меню «Поделиться» Android.
    private static final String BRIDGE_JS =
        "(function(){if(window.__schApk)return;window.__schApk=1;" +
        "function send(blob,name,title){return new Promise(function(ok,no){var r=new FileReader();" +
        "r.onload=function(){var s=String(r.result);AndroidApp.shareFile(name||'file',blob.type||'application/octet-stream'," +
        "s.substring(s.indexOf(',')+1),title||'');ok()};r.onerror=no;r.readAsDataURL(blob)})}" +
        "var can=function(d){return !!(d&&d.files&&d.files.length)};" +
        "var sh=function(d){if(can(d)){var p=Promise.resolve();d.files.forEach(function(f){p=p.then(function(){return send(f,f.name,d.title)})});return p}" +
        "AndroidApp.shareText(((d&&d.title)?d.title+'\\n':'')+((d&&d.text)||'')+((d&&d.url)?'\\n'+d.url:''));return Promise.resolve()};" +
        "try{Object.defineProperty(navigator,'canShare',{value:can,configurable:true})}catch(e){navigator.canShare=can}" +
        "try{Object.defineProperty(navigator,'share',{value:sh,configurable:true})}catch(e){navigator.share=sh}" +
        "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[download]');" +
        "if(!a)return;var h=a.getAttribute('href')||'';if(h.indexOf('blob:')!==0&&h.indexOf('data:')!==0)return;e.preventDefault();" +
        "fetch(h).then(function(r){return r.blob()}).then(function(b){send(b,a.getAttribute('download'),'')})},true)})();";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#6A45E8"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15 рисует под статус-баром и клавиатурой — отодвигаем содержимое
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(BRIDGE_JS, null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                String[] types = params.getAcceptTypes();
                if (types != null) {
                    java.util.ArrayList<String> mimes = new java.util.ArrayList<>();
                    for (String t : types) {
                        for (String p : t.split(",")) {
                            p = p.trim();
                            if (p.contains("/") && !p.equals("*/*")) mimes.add(p);
                        }
                    }
                    if (!mimes.isEmpty() && mimes.size() == countAccept(types)) {
                        i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                    }
                }
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(i, "Выбери файл"), FILE_REQ);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    // если в accept есть расширения (.json), не ограничиваем по MIME — иначе файл может не выбраться
    private static int countAccept(String[] types) {
        int n = 0;
        for (String t : types) for (String p : t.split(",")) if (!p.trim().isEmpty()) n++;
        return n;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_REQ || fileCallback == null) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                result = new Uri[clip.getItemCount()];
                for (int k = 0; k < clip.getItemCount(); k++) result[k] = clip.getItemAt(k).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        android.webkit.CookieManager.getInstance().flush();
    }

    private class Bridge {
        @JavascriptInterface
        public void shareFile(String name, String mime, String base64, String title) {
            try {
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                File f = new File(dir, safe);
                try (FileOutputStream os = new FileOutputStream(f)) {
                    os.write(Base64.decode(base64, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
                send.setClipData(ClipData.newRawUri(safe, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(send, safe)));
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    "Не получилось сохранить файл", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void shareText(String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, "Поделиться")));
        }
    }
}
