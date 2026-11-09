import { MonitorSmartphone, RotateCw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { connectStatus, rotateConnect, startConnect, type ConnectInfo, type ConnectedPhone } from "@/lib/connect/host";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

const STATUS_POLL_MS = 3000;

/** VAYRA Connect on the Mac: pairing QR and paired phones. */
export function ConnectRow() {
  const t = useT();
  const { settings, update } = useSettings();
  const on = settings.connectEnabled;
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [phones, setPhones] = useState<ConnectedPhone[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!on) {
      setInfo(null);
      setPhones([]);
      return;
    }
    let alive = true;
    startConnect()
      .then((next) => {
        if (!alive) return;
        setInfo(next);
        setError(false);
      })
      .catch(() => alive && setError(true));
    const poll = () =>
      connectStatus()
        .then((status) => alive && setPhones(status.phones))
        .catch(() => { /* Keep the last list; the next poll retries. */ });
    poll();
    const id = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [on]);

  useEffect(() => {
    if (!info) {
      setQr(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(info.pairingUrl, { width: 360, margin: 1 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [info]);

  const unpairAll = () => {
    rotateConnect()
      .then((next) => {
        setInfo(next);
        setPhones([]);
      })
      .catch(() => setError(true));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-4 py-3.5">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            on ? "bg-accent/15 text-accent" : "bg-raised text-ink-subtle"
          }`}
        >
          <MonitorSmartphone size={15} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[14px] font-medium text-ink">{t("Let my phones drive this player")}</span>
          <p className="text-[12.5px] leading-relaxed text-ink-subtle">
            {t("A phone paired once on the same Wi-Fi sees what plays here, controls it, starts titles on it and takes playback over. Nothing goes through a server.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("Let my phones drive this player")}
          onClick={() => update({ connectEnabled: !on })}
          className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
            on ? "bg-accent" : "bg-raised"
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-canvas shadow-sm transition-transform ${
              on ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {on && error && (
        <p role="alert" className="px-1 text-[12.5px] text-danger">
          {t("VAYRA Connect could not start. Another app may be using port 11472.")}
        </p>
      )}

      {on && info && (
        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-edge-soft bg-canvas/40 p-4">
          {qr && (
            <img
              src={qr}
              alt={t("Pairing code for VAYRA Connect")}
              width={160}
              height={160}
              className="shrink-0 rounded-lg bg-white p-1.5"
            />
          )}
          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
            <p className="text-[13px] font-medium text-ink">{t("Scan with your phone's camera")}</p>
            <p className="text-[12px] leading-relaxed text-ink-subtle">
              {t("The code pairs the phone with {name} ({address}). Keep it to yourself: it lets the phone control this player.", {
                name: info.name,
                address: info.address,
              })}
            </p>
            <div aria-live="polite" className="flex flex-col gap-1">
              {phones.length === 0 ? (
                <span className="text-[12px] text-ink-muted">{t("No phone connected")}</span>
              ) : (
                phones.map((phone) => (
                  <span key={phone.deviceId} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                    <Smartphone size={13} strokeWidth={2.2} className="text-accent" />
                    {phone.name}
                  </span>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={unpairAll}
              className="mt-1 flex items-center gap-1.5 self-start rounded-full border border-edge-soft px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition-colors hover:border-edge hover:text-ink"
            >
              <RotateCw size={12} strokeWidth={2.4} />
              {t("Unpair all phones")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
