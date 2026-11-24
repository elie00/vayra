import { Subtitles as SubsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { modalOverlayClose, modalOverlayEmitState, modalOverlayOpen } from "@/lib/modal-overlay";
import { openStyleBar } from "@/lib/player/sub-presets";
import { useT } from "@/lib/i18n";
import { MenuBody } from "./subtitle-menu/menu-body";
import type { SubtitleMenuProps } from "./subtitle-menu/types";
import { buildOverlayState } from "./subtitle-menu/utils";
import { useMenuSide } from "./menu-side";
import { Tooltip } from "./transport/tooltip";

export type { SubtitleMenuProps } from "./subtitle-menu/types";

type Props = SubtitleMenuProps;

export function SubtitleMenu(props: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [forceInline, setForceInline] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { side, measure } = useMenuSide(wrap, 500);
  const useOverlay = props.useOverlayPopup === true;
  const inlineOpen = open && (forceInline || !useOverlay);
  const propsRef = useRef(props);
  propsRef.current = props;
  const onOpenChange = props.onOpenChange;
  useEffect(() => {
    onOpenChange?.(inlineOpen);
  }, [inlineOpen, onOpenChange]);

  useEffect(() => {
    if (!inlineOpen) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [inlineOpen]);

  useEffect(() => {
    if (!useOverlay) return;
    const offs: Array<Promise<UnlistenFn>> = [];
    offs.push(
      listen<{ id: string | null }>("modal://subtitle/select", (e) => {
        propsRef.current.onSelect(e.payload.id);
      }),
    );
    offs.push(
      listen<{ sec: number }>("modal://subtitle/delay", (e) => {
        propsRef.current.onDelay(e.payload.sec);
      }),
    );
    offs.push(
      listen<{ url: string; lang?: string; title?: string }>("modal://subtitle/add", (e) => {
        propsRef.current.onAddSubtitle(e.payload.url, e.payload.lang, e.payload.title);
      }),
    );
    offs.push(listen("modal://closed", () => setOpen(false)));
    return () => {
      offs.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, [useOverlay]);

  useEffect(() => {
    if (!useOverlay || !open) return;
    void modalOverlayEmitState("subtitle", buildOverlayState(props));
  }, [useOverlay, open, props.tracks, props.selectedId, props.delaySec, props.metaImdbId, props.metaTitle, props.metaReleaseDate, props.season, props.episode, props]);

  useEffect(() => {
    return () => {
      if (useOverlay && open) {
        void modalOverlayClose();
      }
    };
  }, [useOverlay, open]);

  const handleClick = () => {
    if (!open) measure();
    if (!useOverlay) {
      setOpen((v) => !v);
      return;
    }
    if (open) {
      void modalOverlayClose();
      setOpen(false);
      setForceInline(false);
    } else {
      void modalOverlayOpen("subtitle", buildOverlayState(propsRef.current))
        .then(() => {
          setOpen(true);
          setForceInline(false);
        })
        .catch(() => {
          setOpen(true);
          setForceInline(true);
        });
    }
  };

  const subSelected = props.selectedId != null;

  return (
    <div ref={wrap} className="relative">
      <Tooltip label={t("Subtitles")}>
        <button
          ref={triggerRef}
          type="button"
          onClick={handleClick}
          aria-label={t("Subtitles")}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none ${
            open ? "bg-white/20 text-white ring-1 ring-white/15" : "text-white/80 hover:bg-white/12 hover:text-white"
          }`}
        >
          <SubsIcon size={19} strokeWidth={1.9} />
          {subSelected && (
            <span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
        </button>
      </Tooltip>
      {inlineOpen && (
        <div
          role="dialog"
          aria-label={t("Subtitles")}
          className={`absolute bottom-[calc(100%+12px)] ${side === "start" ? "start-0" : "end-0"} flex h-[400px] max-h-[72vh] w-[500px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#111215]/94 shadow-[0_28px_72px_-20px_rgba(0,0,0,0.92)] backdrop-blur-2xl`}
        >
          <MenuBody {...props} onClose={() => { setOpen(false); triggerRef.current?.focus(); }} onOpenStyleBar={openStyleBar} />
        </div>
      )}
    </div>
  );
}

export function SubtitleMenuBody(props: Props & { onClose: () => void }) {
  return <MenuBody {...props} />;
}
