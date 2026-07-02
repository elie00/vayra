package app.harbor

import android.app.Activity
import android.app.PictureInPictureParams
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Rational
import android.view.LayoutInflater
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.PlayerView
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native ExoPlayer (androidx.media3) backend bridged to the Tauri WebView via the
 * `HarborExo` JavaScript interface. Mirrors Harbor desktop's mpv pattern: the video
 * renders into a PlayerView inserted behind the (transparent) WebView so the web UI
 * draws its controls on top.
 *
 * @JavascriptInterface methods are invoked on a WebView worker thread; every ExoPlayer
 * interaction is posted to the main thread. getState() returns a volatile JSON snapshot
 * rebuilt on the main thread by the Player.Listener callbacks and a 500 ms ticker.
 */
@OptIn(UnstableApi::class)
class HarborExoBridge(private val activity: Activity, private val webView: WebView) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val defaultUserAgent = "Harbor/1.0 (Android; ExoPlayer)"

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var httpFactory: DefaultHttpDataSource.Factory? = null

    private var visible = false
    private var currentVolume = 1.0f
    private var muted = false

    // main-thread confined
    private var resizeModeStr = "fit"
    private var abLoopA = -1.0
    private var abLoopB = -1.0
    private var currentUri: String? = null
    private var currentSubs = ArrayList<MediaItem.SubtitleConfiguration>()
    private var pendingSubSelectId: String? = null

    @Volatile
    private var pipActive = false

    @Volatile
    private var lastError: String? = null

    @Volatile
    private var stateJson: String = emptyState()

    // ---- JS contract ------------------------------------------------------

    @JavascriptInterface
    fun init(): String = post { ensurePlayer() }

    @JavascriptInterface
    fun load(json: String): String {
        val opts: JSONObject
        val url: String
        try {
            opts = JSONObject(json)
            url = opts.getString("url")
        } catch (e: Exception) {
            return "error:invalid load payload: ${e.message}"
        }
        val startSec = opts.optDouble("startSec", 0.0)
        val speed = opts.optDouble("speed", 1.0)
        val headers = parseHeaders(opts.optJSONObject("headers"))
        val subConfigs = try {
            buildSubConfigs(opts.optJSONArray("subs"))
        } catch (e: Exception) {
            return "error:cannot build media item: ${e.message}"
        }

        return post {
            ensurePlayer()
            val p = player ?: return@post
            lastError = null
            abLoopA = -1.0
            abLoopB = -1.0
            pendingSubSelectId = null
            currentUri = url
            currentSubs = ArrayList(subConfigs)
            httpFactory?.setDefaultRequestProperties(headers)
            p.setPlaybackParameters(PlaybackParameters(speed.toFloat().coerceAtLeast(0.1f)))
            p.setMediaItem(buildMediaItem(url, currentSubs))
            p.prepare()
            if (startSec > 0.0) p.seekTo((startSec * 1000).toLong())
            p.playWhenReady = true
            setVisibleInternal(true)
            emitState()
        }
    }

    @JavascriptInterface
    fun play(): String = post { player?.play() }

    @JavascriptInterface
    fun pause(): String = post { player?.pause() }

    @JavascriptInterface
    fun stop(): String = post {
        player?.let {
            it.pause()
            it.stop()
        }
        setVisibleInternal(false)
        emitState()
    }

    @JavascriptInterface
    fun seek(seconds: String): String {
        val sec = seconds.toDoubleOrNull() ?: return "error:bad seconds"
        return post { player?.seekTo((sec * 1000).toLong()) }
    }

    @JavascriptInterface
    fun setSpeed(rate: String): String {
        val r = rate.toFloatOrNull() ?: return "error:bad rate"
        return post { player?.setPlaybackParameters(PlaybackParameters(r.coerceAtLeast(0.1f))) }
    }

    @JavascriptInterface
    fun setVolume(v: String): String {
        val vol = v.toFloatOrNull()?.coerceIn(0f, 1f) ?: return "error:bad volume"
        return post {
            currentVolume = vol
            if (!muted) player?.volume = vol
            emitState()
        }
    }

    @JavascriptInterface
    fun setMuted(b: String): String {
        val m = b.equals("true", ignoreCase = true)
        return post {
            muted = m
            player?.volume = if (m) 0f else currentVolume
            emitState()
        }
    }

    @JavascriptInterface
    fun setAudioTrack(id: String): String = post { applyTrackOverride(id) }

    @JavascriptInterface
    fun setSubTrack(id: String): String = post {
        val p = player ?: return@post
        val params = p.trackSelectionParameters.buildUpon()
        if (id.isEmpty() || id == "off") {
            params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .clearOverridesOfType(C.TRACK_TYPE_TEXT)
        } else {
            val override = overrideFor(id) ?: return@post
            params.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .setOverrideForType(override)
        }
        p.trackSelectionParameters = params.build()
        emitState()
    }

    @JavascriptInterface
    fun setVisible(b: String): String {
        val show = b.equals("true", ignoreCase = true)
        return post { setVisibleInternal(show) }
    }

    @JavascriptInterface
    fun setResize(mode: String): String = post {
        resizeModeStr = when (mode) {
            "fill" -> "fill"
            "zoom" -> "zoom"
            else -> "fit"
        }
        playerView?.resizeMode = when (mode) {
            "fill" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
            "zoom" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
        emitState()
    }

    @JavascriptInterface
    fun setAbLoop(json: String): String {
        if (json == "off" || json == "\"off\"") {
            return post {
                abLoopA = -1.0
                abLoopB = -1.0
            }
        }
        val a: Double
        val b: Double
        try {
            val o = JSONObject(json)
            a = o.getDouble("a")
            b = o.getDouble("b")
        } catch (e: Exception) {
            return "error:bad ab loop: ${e.message}"
        }
        return post {
            abLoopA = a
            abLoopB = b
        }
    }

    @JavascriptInterface
    fun addSubtitle(json: String): String {
        val url: String
        val obj: JSONObject
        try {
            obj = JSONObject(json)
            url = obj.getString("url")
        } catch (e: Exception) {
            return "error:bad subtitle: ${e.message}"
        }
        val mime = optStr(obj, "mime") ?: guessSubMime(url)
        val lang = optStr(obj, "lang")
        val label = optStr(obj, "label")
        return post {
            val p = player ?: return@post
            val uri = currentUri ?: return@post
            val cfg = MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
                .setId(url)
                .setMimeType(mime)
                .setLanguage(lang)
                .setLabel(label)
                .build()
            currentSubs.add(cfg)
            val pos = p.currentPosition
            val wasPlaying = p.playWhenReady
            p.setMediaItem(buildMediaItem(uri, currentSubs), /* resetPosition = */ false)
            p.prepare()
            p.seekTo(pos)
            p.playWhenReady = wasPlaying
            pendingSubSelectId = url
            emitState()
        }
    }

    @JavascriptInterface
    fun setSubStyle(json: String): String {
        val o: JSONObject
        try {
            o = JSONObject(json)
        } catch (e: Exception) {
            return "error:bad style: ${e.message}"
        }
        return post {
            val sv = playerView?.subtitleView ?: return@post
            val fg = parseColorOr(o.optString("fgColor", ""), Color.WHITE)
            val bgRaw = o.optString("bgColor", "")
            val bg = if (bgRaw == "transparent") Color.TRANSPARENT else parseColorOr(bgRaw, Color.TRANSPARENT)
            val edge = when (o.optString("edge", "")) {
                "none" -> CaptionStyleCompat.EDGE_TYPE_NONE
                "shadow" -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW
                else -> CaptionStyleCompat.EDGE_TYPE_OUTLINE
            }
            sv.setApplyEmbeddedStyles(false)
            sv.setStyle(CaptionStyleCompat(fg, bg, Color.TRANSPARENT, edge, Color.BLACK, null))
            if (o.has("sizeFraction")) sv.setFractionalTextSize(o.getDouble("sizeFraction").toFloat())
        }
    }

    @JavascriptInterface
    fun screenshot(): String {
        val latch = CountDownLatch(1)
        val holder = arrayOfNulls<String>(1)
        mainHandler.post {
            try {
                val tv = playerView?.videoSurfaceView as? TextureView
                val bmp = tv?.bitmap
                if (bmp == null) {
                    holder[0] = "error:no frame available"
                } else {
                    val baos = ByteArrayOutputStream()
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, baos)
                    holder[0] = "data:image/png;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
                }
            } catch (e: Exception) {
                holder[0] = "error:${e.message}"
            } finally {
                latch.countDown()
            }
        }
        return try {
            if (latch.await(2, TimeUnit.SECONDS)) holder[0] ?: "error:null result" else "error:timeout"
        } catch (e: InterruptedException) {
            "error:interrupted"
        }
    }

    @JavascriptInterface
    fun enterPip(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "error:pip requires api 26"
        val latch = CountDownLatch(1)
        val holder = arrayOfNulls<String>(1)
        mainHandler.post {
            try {
                val builder = PictureInPictureParams.Builder()
                val w = player?.videoSize?.width ?: 0
                val h = player?.videoSize?.height ?: 0
                if (w > 0 && h > 0) {
                    val ratio = w.toDouble() / h.toDouble()
                    // Android only accepts aspect ratios in [0.4185, 2.39]
                    if (ratio in 0.42..2.39) builder.setAspectRatio(Rational(w, h))
                }
                holder[0] = if (activity.enterPictureInPictureMode(builder.build())) "ok"
                else "error:enter pip refused"
            } catch (e: Exception) {
                holder[0] = "error:${e.message}"
            } finally {
                latch.countDown()
            }
        }
        return try {
            if (latch.await(2, TimeUnit.SECONDS)) holder[0] ?: "error:null result" else "error:timeout"
        } catch (e: InterruptedException) {
            "error:interrupted"
        }
    }

    @JavascriptInterface
    fun getState(): String = stateJson

    @JavascriptInterface
    fun destroy(): String = post {
        stopTicker()
        player?.release()
        player = null
        val pv = playerView
        if (pv != null) {
            (pv.parent as? ViewGroup)?.removeView(pv)
        }
        playerView = null
        httpFactory = null
        visible = false
        currentUri = null
        currentSubs = ArrayList()
        pendingSubSelectId = null
        abLoopA = -1.0
        abLoopB = -1.0
        webView.setBackgroundColor(Color.BLACK)
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        stateJson = emptyState()
    }

    /** Called from MainActivity.onDestroy to guarantee player release. */
    fun onActivityDestroyed() {
        mainHandler.post {
            stopTicker()
            player?.release()
            player = null
        }
    }

    // ---- Player / view setup (main thread) --------------------------------

    private fun ensurePlayer() {
        if (player != null) return

        val factory = DefaultHttpDataSource.Factory()
            .setUserAgent(defaultUserAgent)
            .setAllowCrossProtocolRedirects(true)
        httpFactory = factory

        val exo = ExoPlayer.Builder(activity)
            .setMediaSourceFactory(DefaultMediaSourceFactory(factory))
            .build()
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()
        exo.setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
        exo.volume = currentVolume
        exo.addListener(playerListener)
        player = exo

        ensureView(exo)
    }

    private fun ensureView(exo: ExoPlayer) {
        if (playerView != null) {
            playerView?.player = exo
            return
        }
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        val pv = LayoutInflater.from(activity)
            .inflate(R.layout.harbor_exo_player, content, false) as PlayerView
        pv.player = exo
        pv.subtitleView?.setStyle(
            CaptionStyleCompat(
                Color.WHITE,
                Color.TRANSPARENT,
                Color.TRANSPARENT,
                CaptionStyleCompat.EDGE_TYPE_OUTLINE,
                Color.BLACK,
                null
            )
        )
        pv.visibility = View.GONE
        // index 0 => drawn first => behind the WebView
        content.addView(pv, 0)
        playerView = pv
    }

    private fun setVisibleInternal(show: Boolean) {
        visible = show
        playerView?.visibility = if (show) View.VISIBLE else View.GONE
        webView.setBackgroundColor(if (show) Color.TRANSPARENT else Color.BLACK)
        if (!show) {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else if (player?.isPlaying == true) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ---- MediaItem building -----------------------------------------------

    private fun buildMediaItem(url: String, subs: List<MediaItem.SubtitleConfiguration>): MediaItem {
        val builder = MediaItem.Builder().setUri(url)
        if (subs.isNotEmpty()) builder.setSubtitleConfigurations(subs)
        return builder.build()
    }

    private fun buildSubConfigs(subs: JSONArray?): ArrayList<MediaItem.SubtitleConfiguration> {
        val configs = ArrayList<MediaItem.SubtitleConfiguration>()
        if (subs == null) return configs
        for (i in 0 until subs.length()) {
            val s = subs.optJSONObject(i) ?: continue
            val subUrl = s.optString("url", "")
            if (subUrl.isEmpty()) continue
            val mime = s.optString("mime", "").ifEmpty { guessSubMime(subUrl) }
            configs.add(
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                    .setId(subUrl)
                    .setMimeType(mime)
                    .setLanguage(optStr(s, "lang"))
                    .setLabel(optStr(s, "label"))
                    .build()
            )
        }
        return configs
    }

    private fun parseColorOr(value: String, fallback: Int): Int {
        if (value.isEmpty()) return fallback
        return try {
            Color.parseColor(value)
        } catch (e: Exception) {
            fallback
        }
    }

    private fun guessSubMime(url: String): String {
        val lower = url.substringBefore('?').lowercase()
        return when {
            lower.endsWith(".srt") -> MimeTypes.APPLICATION_SUBRIP
            lower.endsWith(".vtt") -> MimeTypes.TEXT_VTT
            lower.endsWith(".ass") || lower.endsWith(".ssa") -> MimeTypes.TEXT_SSA
            else -> MimeTypes.APPLICATION_SUBRIP
        }
    }

    private fun optStr(o: JSONObject, key: String): String? =
        if (o.has(key) && !o.isNull(key)) o.optString(key) else null

    private fun parseHeaders(obj: JSONObject?): Map<String, String> {
        if (obj == null) return emptyMap()
        val map = HashMap<String, String>()
        val keys = obj.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            map[k] = obj.optString(k, "")
        }
        return map
    }

    // ---- Track selection --------------------------------------------------

    private fun applyTrackOverride(id: String) {
        val p = player ?: return
        val override = overrideFor(id) ?: return
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setOverrideForType(override)
            .build()
        emitState()
    }

    /** id format "a:<groupIdx>:<trackIdx>" or "s:<groupIdx>:<trackIdx>". */
    private fun overrideFor(id: String): TrackSelectionOverride? {
        val p = player ?: return null
        val parts = id.split(":")
        if (parts.size != 3) return null
        val gi = parts[1].toIntOrNull() ?: return null
        val ti = parts[2].toIntOrNull() ?: return null
        val groups = p.currentTracks.groups
        if (gi < 0 || gi >= groups.size) return null
        val group = groups[gi]
        if (ti < 0 || ti >= group.length) return null
        return TrackSelectionOverride(group.mediaTrackGroup, ti)
    }

    // ---- State snapshot + events ------------------------------------------

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) = emitState()
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                if (visible) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                startTicker()
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                stopTicker()
            }
            emitState()
        }
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) = emitState()
        override fun onTracksChanged(tracks: Tracks) {
            maybeSelectPendingSub(tracks)
            emitState()
        }
        override fun onVideoSizeChanged(videoSize: VideoSize) = emitState()
        override fun onPositionDiscontinuity(
            oldPosition: Player.PositionInfo,
            newPosition: Player.PositionInfo,
            reason: Int
        ) = emitState()
        override fun onRenderedFirstFrame() = emitState()
        override fun onPlayerError(error: PlaybackException) {
            lastError = error.errorCodeName + ": " + (error.message ?: "playback error")
            emitState()
        }
    }

    private val ticker = object : Runnable {
        override fun run() {
            enforceAbLoop()
            emitState()
            if (player?.isPlaying == true) mainHandler.postDelayed(this, 500)
        }
    }

    private fun enforceAbLoop() {
        val p = player ?: return
        if (abLoopA >= 0 && abLoopB > abLoopA && p.currentPosition / 1000.0 >= abLoopB) {
            p.seekTo((abLoopA * 1000).toLong())
        }
    }

    /** After tracks appear, select the sideloaded text track added via addSubtitle(). */
    private fun maybeSelectPendingSub(tracks: Tracks) {
        val target = pendingSubSelectId ?: return
        val p = player ?: return
        val groups = tracks.groups
        for (gi in groups.indices) {
            val g = groups[gi]
            if (g.type != C.TRACK_TYPE_TEXT) continue
            for (ti in 0 until g.length) {
                if (g.getTrackFormat(ti).id == target) {
                    p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                        .setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, ti))
                        .build()
                    pendingSubSelectId = null
                    return
                }
            }
        }
    }

    private fun startTicker() {
        mainHandler.removeCallbacks(ticker)
        mainHandler.post(ticker)
    }

    private fun stopTicker() {
        mainHandler.removeCallbacks(ticker)
    }

    private fun emitState() {
        rebuildState()
        emitEvent("{\"type\":\"state\",\"state\":$stateJson}")
    }

    private fun emitEvent(payload: String) {
        webView.post {
            webView.evaluateJavascript(
                "window.__HARBOR_EXO_EVENT__&&window.__HARBOR_EXO_EVENT__($payload)",
                null
            )
        }
    }

    // ---- Activity callbacks (called from MainActivity, main thread) --------

    /** Reflect PiP mode changes (from MainActivity.onPictureInPictureModeChanged). */
    fun onPipChanged(active: Boolean) {
        mainHandler.post {
            pipActive = active
            emitEvent("{\"type\":\"pip\",\"active\":$active}")
            emitState()
        }
    }

    /** Push a foreground/background lifecycle event (from MainActivity.onStart/onStop). */
    fun pushLifecycle(state: String) {
        emitEvent("{\"type\":\"lifecycle\",\"state\":\"$state\"}")
    }

    /** Route the Android back button through the web app; background the task on "exit". */
    fun handleBack() {
        webView.post {
            webView.evaluateJavascript(
                "window.__HARBOR_BACK__ ? window.__HARBOR_BACK__() : 'exit'"
            ) { result ->
                if (result != null && result.contains("exit")) activity.moveTaskToBack(true)
            }
        }
    }

    private fun rebuildState() {
        val p = player
        val json = JSONObject()
        if (p == null) {
            stateJson = emptyState()
            return
        }
        val durationMs = p.duration
        json.put("position", p.currentPosition / 1000.0)
        json.put("duration", if (durationMs == C.TIME_UNSET) -1.0 else durationMs / 1000.0)
        json.put("buffered", p.bufferedPosition / 1000.0)
        json.put("paused", !p.playWhenReady)
        json.put("buffering", p.playbackState == Player.STATE_BUFFERING)
        json.put("ended", p.playbackState == Player.STATE_ENDED)
        json.put("speed", p.playbackParameters.speed.toDouble())
        json.put("volume", currentVolume.toDouble())
        json.put("muted", muted)
        json.put("pip", pipActive)
        json.put("resizeMode", resizeModeStr)
        json.put("videoWidth", p.videoSize.width)
        json.put("videoHeight", p.videoSize.height)

        val audio = JSONArray()
        val subs = JSONArray()
        val groups = p.currentTracks.groups
        for (gi in groups.indices) {
            val g = groups[gi]
            for (ti in 0 until g.length) {
                val format = g.getTrackFormat(ti)
                val selected = g.isTrackSelected(ti)
                when (g.type) {
                    C.TRACK_TYPE_AUDIO -> audio.put(trackJson("a:$gi:$ti", format.label, format.language, selected))
                    C.TRACK_TYPE_TEXT -> subs.put(trackJson("s:$gi:$ti", format.label, format.language, selected))
                }
            }
        }
        json.put("audioTracks", audio)
        json.put("subTracks", subs)
        json.put("error", lastError ?: JSONObject.NULL)
        stateJson = json.toString()
    }

    private fun trackJson(id: String, label: String?, lang: String?, selected: Boolean): JSONObject {
        val o = JSONObject()
        o.put("id", id)
        o.put("label", label ?: lang ?: id)
        o.put("lang", lang ?: JSONObject.NULL)
        o.put("selected", selected)
        return o
    }

    private fun emptyState(): String {
        return JSONObject().apply {
            put("position", 0.0)
            put("duration", -1.0)
            put("buffered", 0.0)
            put("paused", true)
            put("buffering", false)
            put("ended", false)
            put("speed", 1.0)
            put("volume", currentVolume.toDouble())
            put("muted", muted)
            put("pip", pipActive)
            put("resizeMode", resizeModeStr)
            put("videoWidth", 0)
            put("videoHeight", 0)
            put("audioTracks", JSONArray())
            put("subTracks", JSONArray())
            put("error", JSONObject.NULL)
        }.toString()
    }

    // ---- helpers ----------------------------------------------------------

    /** Runs [block] on the main thread and returns "ok" (or "error:<msg>" if posting fails). */
    private inline fun post(crossinline block: () -> Unit): String {
        return try {
            mainHandler.post {
                try {
                    block()
                } catch (e: Exception) {
                    lastError = e.message
                }
            }
            "ok"
        } catch (e: Exception) {
            "error:${e.message}"
        }
    }
}
