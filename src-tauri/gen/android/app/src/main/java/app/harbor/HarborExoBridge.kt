package app.harbor

import android.app.Activity
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
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
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.PlayerView
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
        val subs = opts.optJSONArray("subs")

        val item = try {
            buildMediaItem(url, subs)
        } catch (e: Exception) {
            return "error:cannot build media item: ${e.message}"
        }

        return post {
            ensurePlayer()
            val p = player ?: return@post
            lastError = null
            httpFactory?.setDefaultRequestProperties(headers)
            p.setPlaybackParameters(PlaybackParameters(speed.toFloat().coerceAtLeast(0.1f)))
            p.setMediaItem(item)
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

    private fun buildMediaItem(url: String, subs: JSONArray?): MediaItem {
        val builder = MediaItem.Builder().setUri(url)
        if (subs != null && subs.length() > 0) {
            val configs = ArrayList<MediaItem.SubtitleConfiguration>()
            for (i in 0 until subs.length()) {
                val s = subs.optJSONObject(i) ?: continue
                val subUrl = s.optString("url", "")
                if (subUrl.isEmpty()) continue
                val mime = s.optString("mime", "").ifEmpty { guessSubMime(subUrl) }
                val cfg = MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(subUrl))
                    .setMimeType(mime)
                    .setLanguage(optStr(s, "lang"))
                    .setLabel(optStr(s, "label"))
                    .build()
                configs.add(cfg)
            }
            if (configs.isNotEmpty()) builder.setSubtitleConfigurations(configs)
        }
        return builder.build()
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
        override fun onTracksChanged(tracks: Tracks) = emitState()
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
            emitState()
            if (player?.isPlaying == true) mainHandler.postDelayed(this, 500)
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
        val payload = "{\"type\":\"state\",\"state\":$stateJson}"
        webView.post {
            webView.evaluateJavascript(
                "window.__HARBOR_EXO_EVENT__&&window.__HARBOR_EXO_EVENT__($payload)",
                null
            )
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
        json.put("paused", !p.playWhenReady)
        json.put("buffering", p.playbackState == Player.STATE_BUFFERING)
        json.put("ended", p.playbackState == Player.STATE_ENDED)
        json.put("speed", p.playbackParameters.speed.toDouble())
        json.put("volume", currentVolume.toDouble())
        json.put("muted", muted)
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
            put("paused", true)
            put("buffering", false)
            put("ended", false)
            put("speed", 1.0)
            put("volume", currentVolume.toDouble())
            put("muted", muted)
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
