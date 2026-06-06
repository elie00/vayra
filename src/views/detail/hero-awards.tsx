import { AwardLogo, laurelColorFor } from "@/components/icons/award-logo";
import { Laurel } from "@/components/icons/laurel";

export function HeroAwardsCorner({
  summary,
}: {
  summary: { type: string; wins: number; nominations: number }[];
}) {
  const top = summary[0];
  if (!top) return null;
  const lines: string[] = [];
  for (const item of summary) {
    if (item.wins > 0) {
      const winPart = `${item.wins} ${awardNoun(item.type, item.wins)}`;
      lines.push(
        item.nominations > 0
          ? `${winPart} · ${item.nominations} ${item.nominations === 1 ? "nomination" : "nominations"}`
          : winPart,
      );
    } else if (item.nominations > 0) {
      lines.push(
        `${item.nominations} ${awardNoun(item.type, item.nominations)} ${item.nominations === 1 ? "nomination" : "nominations"}`,
      );
    }
  }
  if (lines.length === 0) return null;
  const won = top.wins > 0;
  const headline = `${headlineFor(top.type)} ${won ? "Winner" : "Nominee"}`;
  const laurelTint = laurelColorFor(top.type);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        document.getElementById("awards-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="absolute bottom-14 right-12 flex max-w-xs items-center gap-4 rounded-2xl px-3 py-2 text-right transition-all duration-200 hover:bg-canvas/45 hover:-translate-y-0.5"
    >
      <span
        className="text-accent transition-transform duration-200 group-hover:scale-105"
        style={laurelTint ? { color: laurelTint } : undefined}
      >
        {won ? (
          <Laurel size={68}>
            <AwardLogo type={top.type} size={24} />
          </Laurel>
        ) : (
          <span className="opacity-80">
            <AwardLogo type={top.type} size={28} />
          </span>
        )}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink/55">
          {headline}
        </span>
        <div className="flex flex-col gap-0.5 text-[13px] font-medium leading-snug text-ink/70">
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

function awardNoun(type: string, n: number): string {
  const plural = n === 1 ? "" : "s";
  switch (type) {
    case "oscar":
      return `Oscar${plural}`;
    case "emmy":
      return `Emmy${n === 1 ? "" : "s"}`;
    case "bafta":
      return `BAFTA${plural}`;
    case "golden_globe":
      return `Golden Globe${plural}`;
    case "sag":
      return `SAG Award${plural}`;
    case "critics_choice":
      return `Critics' Choice Award${plural}`;
    case "cannes":
      return `Cannes Award${plural}`;
    case "venice":
      return `Venice Award${plural}`;
    case "berlin":
      return `Berlin Award${plural}`;
    default:
      return `Award${plural}`;
  }
}

function headlineFor(type: string): string {
  switch (type) {
    case "oscar":
      return "Academy Award";
    case "emmy":
      return "Primetime Emmy";
    case "bafta":
      return "BAFTA";
    case "golden_globe":
      return "Golden Globe";
    case "sag":
      return "SAG Award";
    case "cannes":
      return "Cannes";
    case "venice":
      return "Venice";
    case "berlin":
      return "Berlin";
    case "critics_choice":
      return "Critics' Choice";
    default:
      return "Award";
  }
}
