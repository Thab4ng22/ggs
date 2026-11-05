export type Action = "BUY" | "SELL" | "HOLD";

export interface Headline {
  title: string;
  source: string;
  link: string;
  publishedAt: string; // ISO
  query: string;
  score: number; // gold impact, + bullish / - bearish
  tags: string[];
}

export interface Quote {
  symbol: string;
  label: string;
  price: number;
  change1d: number; // %
  change5d: number; // %
  sma10: number;
  series: number[]; // recent closes
}

export interface MarketSnapshot {
  gold: Quote | null;
  dxy: Quote | null;
  us10y: Quote | null;
  vix: Quote | null;
}

export interface ReleaseWindow {
  nextUtc: string; // ISO
  sastTime: string; // "14:30" | "15:30"
  sastDate: string; // human readable
  etTime: string;
  usDst: boolean;
  minutesUntil: number;
  note: string;
}

export interface Component {
  name: string;
  value: number; // -1..1
  weight: number;
  note: string;
}

export interface Signal {
  action: Action;
  confidence: number; // 0-100
  score: number; // -1..1
  components: Component[];
}

export interface Scenario {
  name: string;
  goldMove: "UP" | "DOWN" | "MIXED";
  text: string;
}

export interface RegionOutlook {
  name: string;
  risk: number; // 0-100
  trend: "rising" | "easing" | "steady";
  headlineCount: number;
  outlook: string;
  topHeadlines: { title: string; link: string; source: string }[];
}

export interface Prediction {
  title: string;
  horizon: string;
  direction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  reasoning: string;
}

export interface Report {
  generatedAt: string;
  mode: "heuristic" | "heuristic+llm";
  model?: string;
  release: ReleaseWindow;
  market: MarketSnapshot;
  signal: Signal;
  scenarios: Scenario[];
  regions: RegionOutlook[];
  predictions: Prediction[];
  headlines: Headline[];
  narrative: string;
  stats: { headlinesAnalyzed: number; sources: number; failedSources: number };
  warnings: string[];
}
