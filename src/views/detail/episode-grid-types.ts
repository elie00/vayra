export type Progress = { ratio: number; watched: boolean; startedAt: number };

export type GridEpisode = {
  key: string;
  number: number;
  season: number;
  title: string;
  stills: string[];
  runtime: number | null;
  airDate: string | null;
  overview?: string;
  rating?: number;
  filler?: boolean;
  upcoming?: boolean;
  play: () => void;
};
