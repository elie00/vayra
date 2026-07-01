import { useEffect, useRef, useState } from "react";
import { Music, Shuffle, SkipBack, SkipForward, Repeat, Play } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings } from "@/lib/settings";
import { onSongIdToast, type SongIdToastMsg } from "@/lib/song-id";

type SongCardStyle = "compact" | "cinematic";

/** In-player "Now Playing" card for song identification.
 *  Two selectable styles (Settings → Library & metadata → Now Playing card):
 *   - compact:   spinning disc beside the title + control strip below.
 *   - cinematic: large centered cover with the disc behind it.
 *  Clicking a result opens the track on YouTube. */
export function SongIdToast() {
  const { settings } = useSettings();
  const style = (settings.songCardStyle ?? "cinematic") as SongCardStyle;
  const showDetails = settings.songCardDetails ?? true;

  const [msg, setMsg] = useState<SongIdToastMsg | null>(null);
  const [enter, setEnter] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const off = onSongIdToast((t) => {
      setMsg(t);
      if (timer.current) window.clearTimeout(timer.current);
      // Keep "Listening…" until replaced; auto-hide results/errors.
      if (t.kind !== "info") {
        timer.current = window.setTimeout(() => setMsg(null), 12000);
      }
    });
    return () => {
      off();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // Smooth grow-in transition whenever a new message arrives.
  useEffect(() => {
    if (!msg) {
      setEnter(false);
      return;
    }
    setEnter(false);
    const id = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(id);
  }, [msg]);

  if (!msg) return null;

  const listening = msg.kind === "info";
  const isResult = msg.kind === "result";
  const body = showDetails ? msg.body : undefined;

  const open = () => {
    if (msg.href) openUrl(msg.href).catch((e) => console.error("open failed", e));
  };

  const anim = [
    "origin-top transition-all duration-500 ease-out",
    enter ? "scale-100 opacity-100" : "scale-90 opacity-0",
    isResult ? "pointer-events-auto cursor-pointer hover:ring-white/25" : "",
  ].join(" ");

  return (
    <div className="pointer-events-none absolute left-1/2 top-8 z-30 flex -translate-x-1/2 flex-col items-center gap-3">
      <span className="rounded-full bg-black/70 px-4 py-1.5 text-sm font-semibold text-white/90 shadow-lg backdrop-blur">
        ▶ Now Playing
      </span>

      {style === "compact" ? (
        <div
          role={isResult ? "button" : undefined}
          onClick={isResult ? open : undefined}
          className={[
            "flex flex-col gap-3 rounded-3xl bg-black/85 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl",
            isResult ? "w-[min(92vw,520px)]" : "w-[min(86vw,420px)]",
            anim,
          ].join(" ")}
        >
          <div className="flex items-center gap-4">
            <Vinyl art={msg.art} size="h-20 w-20" listening={listening} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-lg font-semibold leading-tight">{msg.title}</span>
              {body ? (
                <span className="truncate text-sm text-white/65">{body}</span>
              ) : listening ? (
                <span className="text-sm text-white/65">Identifying the current track…</span>
              ) : null}
              {isResult ? (
                <span className="truncate text-xs text-white/40">Tap to open on YouTube</span>
              ) : null}
            </div>
          </div>
          {isResult ? <Controls /> : null}
        </div>
      ) : (
        <div
          role={isResult ? "button" : undefined}
          onClick={isResult ? open : undefined}
          className={[
            "flex flex-col items-center gap-4 rounded-3xl bg-black/90 p-6 text-center text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl",
            isResult ? "w-[min(90vw,460px)]" : "w-[min(82vw,340px)]",
            anim,
          ].join(" ")}
        >
          <Vinyl art={msg.art} size={isResult ? "h-52 w-52" : "h-32 w-32"} listening={listening} />
          <div className="flex w-full min-w-0 flex-col gap-0.5">
            <span className="truncate text-xl font-bold leading-tight">{msg.title}</span>
            {body ? (
              <span className="truncate text-sm text-white/65">{body}</span>
            ) : listening ? (
              <span className="text-sm text-white/65">Identifying the current track…</span>
            ) : null}
            {isResult ? (
              <span className="mt-1 text-xs text-white/40">Tap to open on YouTube</span>
            ) : null}
          </div>
          {isResult ? <Controls /> : null}
        </div>
      )}
    </div>
  );
}

function Vinyl({
  art,
  size,
  listening,
}: {
  art?: string;
  size: string;
  listening: boolean;
}) {
  return (
    <div className={`relative flex-none ${size}`}>
      <div className="absolute inset-0 animate-spin rounded-full [animation-duration:6s]">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-neutral-700 via-neutral-900 to-black" />
        <div className="absolute inset-[6%] rounded-full ring-1 ring-white/5" />
        <div className="absolute inset-[12%] rounded-full ring-1 ring-white/5" />
        {art ? (
          <img src={art} alt="" className="absolute inset-[20%] rounded-full object-cover" />
        ) : (
          <div className="absolute inset-[20%] flex items-center justify-center rounded-full bg-white/10">
            <Music size={28} strokeWidth={1.8} className={listening ? "animate-pulse" : undefined} />
          </div>
        )}
        {/* spindle hole */}
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black ring-2 ring-white/40" />
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/15">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-white/80" />
      </div>
      <div className="flex items-center justify-center gap-6 text-white/80">
        <Shuffle size={18} className="opacity-50" />
        <SkipBack size={20} className="opacity-70" />
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-md">
          <Play size={22} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
        </span>
        <SkipForward size={20} className="opacity-70" />
        <Repeat size={18} className="opacity-50" />
      </div>
    </div>
  );
}