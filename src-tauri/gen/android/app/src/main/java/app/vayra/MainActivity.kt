package app.vayra

import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var exoBridge: HarborExoBridge? = null

  // The system bars and display cutout in CSS px, for the page
  // (src/lib/android-insets.ts): this WebView reports env(safe-area-inset-*) as 0
  // under edge-to-edge bars.
  @Volatile private var insetsJson: String? = null

  private inner class Insets {
    @JavascriptInterface fun read(): String = insetsJson ?: ""
  }

  // Native Material 3 tactile feedback using Android's HapticFeedbackConstants
  // (respects the user's system "Touch feedback" preference automatically).
  private class Haptics(private val view: WebView) {
    @JavascriptInterface
    fun perform(kind: String) {
      val code = when (kind) {
        "confirm" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM
          else HapticFeedbackConstants.VIRTUAL_KEY
        "reject" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT
          else HapticFeedbackConstants.LONG_PRESS
        "gesture" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.GESTURE_END
          else HapticFeedbackConstants.CLOCK_TICK
        "context" -> HapticFeedbackConstants.CONTEXT_CLICK
        else -> HapticFeedbackConstants.CLOCK_TICK
      }
      view.post { view.performHapticFeedback(code) }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // VAYRA is always dark: keep light system-bar icons whatever the system theme.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Keep the gesture/3-button bar truly transparent over VAYRA's translucent tab bar.
      window.isNavigationBarContrastEnforced = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      }
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    super.onCreate(savedInstanceState)
  }

  // Called by wry (WryActivity.setWebView) right after the RustWebView is created and
  // before the initial page load, so the JS interface is available without a reload.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.setBackgroundColor(VAYRA_CANVAS_COLOR)
    webView.overScrollMode = View.OVER_SCROLL_NEVER
    webView.isHapticFeedbackEnabled = true

    val bridge = HarborExoBridge(this, webView)
    webView.addJavascriptInterface(bridge, "HarborExo")
    exoBridge = bridge

    webView.addJavascriptInterface(Insets(), "VayraInsets")
    webView.addJavascriptInterface(Haptics(webView), "VayraHaptics")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val density = resources.displayMetrics.density
      val json =
        "{\"top\":${bars.top / density},\"bottom\":${bars.bottom / density}," +
          "\"left\":${bars.left / density},\"right\":${bars.right / density}," +
          "\"ime\":${ime.bottom / density}}"
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

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    exoBridge?.onUserLeaveHint()
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

  companion object {
    const val VAYRA_CANVAS_COLOR = 0xFF0A0B0D.toInt()
  }
}
