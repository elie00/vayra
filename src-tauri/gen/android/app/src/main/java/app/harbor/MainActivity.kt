package app.harbor

import android.os.Bundle
import android.webkit.WebView
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
  }

  override fun onDestroy() {
    exoBridge?.onActivityDestroyed()
    exoBridge = null
    super.onDestroy()
  }
}
