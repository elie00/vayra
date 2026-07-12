import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function Signature() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2 pt-2 pb-1">
      <p className="flex items-center gap-1.5 text-center text-[12px] tracking-wide text-ink-subtle">
        VAYRA · A product by EYBO
      </p>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-ink-subtle/80 transition-colors hover:text-ink-muted"
      >
        Know more
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 max-w-md space-y-3 px-2 text-[12.5px] leading-relaxed text-ink-subtle">
          <p>
            VAYRA is a completely free and open source project. VAYRA is under the MIT License and
            you can repurpose and reuse as you wish. By all means profit off of this, shape it to
            your wishes and needs, whatever your heart desires. It is truly Open Source.
          </p>
          <p>
            We originally built this as our own personal client. We love Stremio so much and wanted
            to put our own spin on a protocol we use almost daily. It started off as a simple clean
            player, and as our friends started using it too, it grew into something bigger: watch
            together, insta play, and a lot more.
          </p>
          <p>A special thank you to the team at Stremio-Addons. Please consider supporting them.</p>
          <p>
            This little footnote area we intend to keep unprofessional as opposed to the rest
            of this project. We hope you enjoy!
          </p>
        </div>
      )}
    </div>
  );
}
