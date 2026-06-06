import { useEffect, useRef, useState } from "react";
import { DownloadMenu, SavePill } from "./relay-docs-export";

export function RelayDocs({ onBack }: { onBack: () => void }) {
  const docsRef = useRef<HTMLDivElement>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  useEffect(() => {
    if (!savedPath) return;
    const t = window.setTimeout(() => setSavedPath(null), 7000);
    return () => window.clearTimeout(t);
  }, [savedPath]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-edge-soft bg-canvas/40 p-3">
        <button
          onClick={onBack}
          className="flex h-12 items-center gap-2.5 rounded-xl bg-elevated px-5 text-[14px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-edge-soft)] transition-all hover:bg-raised hover:shadow-[inset_0_0_0_1px_var(--color-edge)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to relay
        </button>
        <div className="flex items-center gap-3">
          <DownloadMenu docsRef={docsRef} onSaved={setSavedPath} />
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
            Documentation
          </span>
        </div>
      </div>

      <div ref={docsRef} className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b border-edge-soft pb-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
          Self-host
        </p>
        <h2 className="font-display text-[32px] font-medium leading-tight tracking-tight text-ink">
          Run your own Harbor Relay
        </h2>
        <p className="text-[14px] leading-relaxed text-ink-muted">
          Two paths: Harbor handles the deploy for you, or you do it yourself with wrangler.
        </p>
      </header>

      <DocsBlock>
        <DocsH2>Overview</DocsH2>
        <DocsP>
          The Harbor relay is a Cloudflare Worker that hosts WebSocket rooms for Watch Together.
          Each user runs their own. There is no central Harbor server.
        </DocsP>
        <DocsP>
          Source: <DocsCode>src-tauri/relay/worker.js</DocsCode>. About 200 lines of JavaScript,
          no dependencies. Read it before deploying if you want to know what runs.
        </DocsP>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Requirements</DocsH2>
        <DocsList>
          <li>A free Cloudflare account.</li>
          <li>About two minutes for the auto-deploy path.</li>
          <li>
            For the manual path: <DocsCode>node</DocsCode> 20+ and{" "}
            <DocsCode>wrangler</DocsCode> CLI.
          </li>
        </DocsList>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Auto-deploy from Harbor</DocsH2>
        <DocsP>
          Easiest path. Harbor uploads the worker, creates the Durable Object namespace, and
          stores the resulting URL.
        </DocsP>
        <DocsOl>
          <li>Open Settings, then Harbor Relay.</li>
          <li>
            Click <DocsKbd>Deploy a relay</DocsKbd>.
          </li>
          <li>
            Generate a Cloudflare API token with{" "}
            <DocsCode>Workers Scripts: Edit</DocsCode> and{" "}
            <DocsCode>Account: Read</DocsCode> permissions at{" "}
            <DocsCode>dash.cloudflare.com/profile/api-tokens</DocsCode>. Paste it into Harbor.
          </li>
          <li>Pick the Cloudflare account to deploy under.</li>
          <li>
            Wait for the upload to finish. The relay URL gets written to{" "}
            <DocsCode>togetherRelayUrl</DocsCode> in Harbor settings.
          </li>
        </DocsOl>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Manual deploy with wrangler</DocsH2>
        <DocsP>
          For users who want to deploy themselves or already have a wrangler workflow.
        </DocsP>
        <DocsOl>
          <li>
            Install wrangler and authenticate:
            <DocsPre>{`npm install -g wrangler
wrangler login`}</DocsPre>
          </li>
          <li>
            Save the worker source. Copy{" "}
            <DocsCode>src-tauri/relay/worker.js</DocsCode> from the Harbor repo into a new
            directory as <DocsCode>worker.js</DocsCode>.
          </li>
          <li>
            Save this <DocsCode>wrangler.toml</DocsCode> next to it:
            <DocsPre>{`name = "harbor-together-relay"
main = "worker.js"
compatibility_date = "2026-05-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]`}</DocsPre>
          </li>
          <li>
            Deploy:
            <DocsPre>wrangler deploy</DocsPre>
          </li>
          <li>
            Note the URL Cloudflare returns. It looks like{" "}
            <DocsCode>https://harbor-together-relay.&lt;subdomain&gt;.workers.dev</DocsCode>.
          </li>
          <li>
            In Harbor: Settings, Harbor Relay, then{" "}
            <DocsKbd>Use a different URL</DocsKbd>. Paste the URL with{" "}
            <DocsCode>wss://</DocsCode> as the scheme instead of{" "}
            <DocsCode>https://</DocsCode>.
          </li>
        </DocsOl>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Verify it works</DocsH2>
        <DocsP>
          Settings, Harbor Relay, then <DocsKbd>Run test</DocsKbd>.
        </DocsP>
        <DocsP>
          The test calls <DocsCode>/health</DocsCode> and confirms the worker is reachable and
          running a current version. A passing test means Watch Together rooms will connect.
        </DocsP>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Sharing your relay</DocsH2>
        <DocsP>
          A relay URL is shareable. Anyone with the URL can join Watch Together rooms hosted on
          your relay. The unique <DocsCode>workers.dev</DocsCode> subdomain acts as the access
          token. There is no login.
        </DocsP>
        <DocsP>
          To run a public relay, post the <DocsCode>wss://</DocsCode> URL on r/Stremio or
          wherever your community lives. Other Harbor users paste it into Settings, Harbor
          Relay, <DocsKbd>Use a different URL</DocsKbd>.
        </DocsP>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Costs</DocsH2>
        <DocsP>Cloudflare Workers free tier:</DocsP>
        <DocsList>
          <li>100,000 requests per day.</li>
          <li>10ms CPU time per request.</li>
          <li>Unlimited Durable Object storage at $0.20 per million reads.</li>
        </DocsList>
        <DocsP>
          A typical Watch Together session uses a few hundred messages per hour. Solo and
          small-group use stays well under free tier limits.
        </DocsP>
        <DocsP>
          If you exceed free tier, the Workers Paid plan is $5 per month and bumps the request
          allowance to 10 million per day.
        </DocsP>
      </DocsBlock>

      <DocsBlock>
        <DocsH2>Troubleshooting</DocsH2>
        <DocsTable
          rows={[
            {
              symptom: "Health check returns 5xx",
              cause: "Worker crashed or hit memory limits",
              fix: "Check logs in Cloudflare dashboard, then redeploy",
            },
            {
              symptom: "Connection refused / DNS does not resolve",
              cause: "Worker deleted or URL wrong",
              fix: "Re-run deploy or paste the correct URL",
            },
            {
              symptom: "Watch Together rooms drop after 6 hours",
              cause: "Durable Object idle eviction",
              fix: "Expected. Rooms recreate on next join.",
            },
          ]}
        />
      </DocsBlock>

      <DocsBlock>
        <DocsH2>What the worker does</DocsH2>
        <DocsList>
          <li>
            <DocsCode>GET /health</DocsCode>: returns JSON with the worker version. Used by the
            test button.
          </li>
          <li>
            <DocsCode>GET /r/&lt;code&gt;</DocsCode> with a WebSocket upgrade: opens a Watch
            Together room. State is held in a Durable Object, no persistence beyond the active
            session.
          </li>
        </DocsList>
      </DocsBlock>
      </div>
      {savedPath && <SavePill path={savedPath} onDismiss={() => setSavedPath(null)} />}
    </div>
  );
}

function DocsBlock({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3">{children}</section>;
}

function DocsH2({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[20px] font-medium tracking-tight text-ink">{children}</h3>
  );
}

function DocsP({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] leading-relaxed text-ink-muted">{children}</p>;
}

function DocsList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-5 flex list-disc flex-col gap-1.5 text-[13.5px] leading-relaxed text-ink-muted marker:text-ink-subtle">
      {children}
    </ul>
  );
}

function DocsOl({ children }: { children: React.ReactNode }) {
  return (
    <ol className="ml-5 flex list-decimal flex-col gap-2.5 text-[13.5px] leading-relaxed text-ink-muted marker:font-semibold marker:text-ink-subtle">
      {children}
    </ol>
  );
}

export function DocsCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-canvas/70 px-1.5 py-0.5 font-mono text-[12px] text-ink ring-1 ring-edge-soft">
      {children}
    </code>
  );
}

function DocsKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-edge-soft bg-elevated px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-ink shadow-[0_1px_0_var(--color-edge)]">
      {children}
    </kbd>
  );
}

function DocsPre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-xl border border-edge-soft bg-canvas/70 p-3 font-mono text-[12px] leading-relaxed text-ink">
      {children}
    </pre>
  );
}

function DocsTable({
  rows,
}: {
  rows: Array<{ symptom: string; cause: string; fix: string }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-edge-soft">
      <table className="w-full text-left text-[12.5px] text-ink-muted">
        <thead className="bg-canvas/60 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          <tr>
            <th className="px-3 py-2.5">Symptom</th>
            <th className="px-3 py-2.5">Cause</th>
            <th className="px-3 py-2.5">Fix</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-edge-soft align-top">
              <td className="px-3 py-2.5 text-ink">{r.symptom}</td>
              <td className="px-3 py-2.5">{r.cause}</td>
              <td className="px-3 py-2.5">{r.fix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
