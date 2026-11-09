package app.vayra

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var exoBridge: HarborExoBridge? = null

  // The system bars in CSS px, for the page (src/lib/android-insets.ts): this
  // WebView reports env(safe-area-inset-*) as 0 under edge-to-edge bars.
  @Volatile private var insetsJson: String? = null

  private inner class Insets {
    @JavascriptInterface fun read(): String = insetsJson ?: ""
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // VAYRA is always dark: keep light system-bar icons whatever the system theme.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
  }

  // Called by wry (WryActivity.setWebView) right after the RustWebView is created and
  // before the initial page load, so the JS interface is available without a reload.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    val bridge = HarborExoBridge(this, webView)
    webView.addJavascriptInterface(bridge, "HarborExo")
    exoBridge = bridge

    webView.addJavascriptInterface(Insets(), "VayraInsets")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val density = resources.displayMetrics.density
      val json = "{\"top\":${bars.top / density},\"bottom\":${bars.bottom / density}}"
      insetsJson = json
      webView.evaluateJavascript("window.__VAYRA_INSETS__ && window.__VAYRA_INSETS__($json)", null)
      ViewCompat.onApplyWindowInsets(view, insets)
    }

    // Registered after wry's own back callback, so this one runs first (LIFO). It always
    // consumes back and lets the web app decide via window.__HARBOR_BACK__.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val b = exoBridge
        if (b != null) b.handleBack() else moveTaskToBack(true)
      }
    })
  }

  override fun onStart() {
    super.onStart()
    exoBridge?.pushLifecycle("foreground")
  }

  override fun onStop() {
    super.onStop()
    exoBridge?.pushLifecycle("background")
  }

  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    exoBridge?.onPipChanged(isInPictureInPictureMode)
  }

  override fun onDestroy() {
    exoBridge?.onActivityDestroyed()
    exoBridge = null
    super.onDestroy()
  }
}
