export type SearchableCommand<T> = T & {
  label: string;
  keywords?: string[];
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function scoreText(text: string, query: string): number {
  if (text === query) return 120;
  if (text.startsWith(query)) return 90;
  if (text.split(/\s+/).some((word) => word.startsWith(query))) return 60;
  if (text.includes(query)) return 30;
  return 0;
}

export function rankCommands<T>(commands: SearchableCommand<T>[], rawQuery: string): SearchableCommand<T>[] {
  const query = normalize(rawQuery);
  if (!query) return commands;
  const tokens = query.split(/\s+/).filter(Boolean);
  return commands
    .map((command, index) => {
      const label = normalize(command.label);
      const keywords = (command.keywords ?? []).map(normalize);
      const tokenScores = tokens.map((token) => Math.max(scoreText(label, token), ...keywords.map((value) => scoreText(value, token))));
      return { command, index, score: tokenScores.every(Boolean) ? tokenScores.reduce((sum, value) => sum + value, 0) : 0 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}
