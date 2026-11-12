package com.mervink.viiv;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The web app picks its own theme (dark by default, light, system or OLED), so the
 * status and navigation bars follow the page, not the phone: a script watches the
 * page's `dark` class and tells us, and we recolour the bars to match.
 */
public class MainActivity extends BridgeActivity {
    private static final int DARK = Color.parseColor("#0A0F14");
    private static final int LIGHT = Color.parseColor("#F7F9FA");
    private static final String WATCH =
        "(function(){var r=document.documentElement;"
            + "function s(){ViivTheme.dark(r.classList.contains('dark'))}"
            + "if(!window.__viivTheme){window.__viivTheme=1;"
            + "new MutationObserver(s).observe(r,{attributes:true,attributeFilter:['class']});}s();})();";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void dark(boolean dark) {
                runOnUiThread(() -> apply(dark));
            }
        }, "ViivTheme");
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(WATCH, null);
            }
        });
        apply(true); // the web app's default, until the page says otherwise
    }

    private void apply(boolean dark) {
        int bg = dark ? DARK : LIGHT;
        getWindow().getDecorView().setBackgroundColor(bg);
        getBridge().getWebView().setBackgroundColor(bg);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }
}
