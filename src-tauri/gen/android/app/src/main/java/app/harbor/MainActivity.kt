package app.harbor

import android.content.res.Configuration
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var exoBridge: HarborExoBridge? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Called by wry (WryActivity.setWebView) right after the RustWebView is created and
  // before the initial page load, so the JS interface is available without a reload.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    val bridge = HarborExoBridge(this, webView)
    webView.addJavascriptInterface(bridge, "HarborExo")
    exoBridge = bridge

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
