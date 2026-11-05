import { fetchAllNews, type RawItem } from "./news";
import { fetchMarket } from "./market";
import type {
  Action,
  Component,
  Headline,
  MarketSnapshot,
  Prediction,
  RegionOutlook,
  Report,
  ReleaseWindow,
  Scenario,
  Signal,
} from "./types";

/* ------------------------------------------------------------------ */
/* 1. Headline scoring: what does this headline mean for gold?         */
/* ------------------------------------------------------------------ */

interface Rule {
  re: RegExp;
  w: number; // + bullish gold, - bearish gold
  tag: string;
  geo?: number; // contribution to geopolitical risk
}

const RULES: Rule[] = [
  // --- bullish ---
  { re: /\b(war|invasion|airstrikes?|missiles?|drone attack|escalat\w*|offensive|bombing|clashes|military buildup|nuclear)\b/i, w: 1, tag: "geopolitical-risk", geo: 1 },
  { re: /\b(tensions?|standoff|threatens?|retaliat\w*|coup|unrest|protests?|assassinat\w*)\b/i, w: 0.5, tag: "tension", geo: 0.5 },
  { re: /\bsanctions?\b/i, w: 0.6, tag: "sanctions", geo: 0.7 },
  { re: /\b(tariffs?|trade war)\b/i, w: 0.5, tag: "trade-war", geo: 0.4 },
  { re: /\b(rate cuts?|cuts? (interest )?rates?|dovish|easing|stimulus|rate-cut|pivot)\b/i, w: 1.5, tag: "monetary-easing" },
  { re: /\b(inflation (rises?|surges?|jumps?|accelerat\w*|hotter|spikes?)|hot(ter)? (cpi|inflation)|prices surge)\b/i, w: 1, tag: "inflation-up" },
  { re: /\b(recession|slowdown|contraction|layoffs|job losses|weak (jobs|payrolls|data)|jobs miss|banking crisis|bank collapse|debt crisis|default|government shutdown)\b/i, w: 1, tag: "growth-fear" },
  { re: /\bgold\b.{0,25}\b(rall\w*|surg\w*|jumps?|records?|climbs?|rises?|gains?|hits?|soars?|extends)\b/i, w: 1.5, tag: "gold-momentum" },
  { re: /\b(central banks?.{0,30}(buy|purchas)\w*|buying (more )?gold|gold reserves)\b/i, w: 1.2, tag: "cb-buying" },
  { re: /\b(weaker dollar|dollar (falls?|slumps?|weakens?|drops?|slides?)|yields? (fall|drop|slip|tumble|decline)\w*)\b/i, w: 1, tag: "dollar-down" },
  { re: /\bsafe[- ]haven\b/i, w: 1, tag: "safe-haven" },
  // --- bearish ---
  { re: /\b(cease-?fire|peace (deal|talks|agreement|plan)|de-?escalat\w*|truce|hostage (deal|release))\b/i, w: -1, tag: "de-escalation", geo: -1 },
  { re: /\b(rate hikes?|raises? (interest )?rates?|hawkish|higher for longer|tightening)\b/i, w: -1.3, tag: "hawkish" },
  { re: /\b(strong (jobs|dollar|data|payrolls|economy)|jobs beat|blowout|stronger dollar|dollar (rises?|rall\w*|surges?|jumps?|strengthens?|gains?)|yields? (rise|jump|surge|climb|spike)\w*)\b/i, w: -1, tag: "dollar-up" },
  { re: /\bgold\b.{0,25}\b(falls?|drops?|slump\w*|slides?|tumbles?|retreats?|slips?|dips?|declines?|sinks?|loses?|pressure|weighs?)\b/i, w: -1.5, tag: "gold-weakness" },
  { re: /\b(risk[- ]on|stocks? (rall\w*|surge|hit record)|record high.{0,15}(s&p|nasdaq|dow|stocks))\b/i, w: -0.4, tag: "risk-on" },
];

const CATALYST_RE = /\b(nonfarm|non-farm|payrolls?|nfp|cpi|ppi|pce|fomc|fed(eral reserve)?|powell|jobless claims|retail sales|gdp|jobs report|interest rates?)\b/i;

function scoreTitle(title: string): { score: number; tags: string[]; geo: number } {
  let score = 0;
  let geo = 0;
  const tags: string[] = [];
  for (const r of RULES) {
    if (r.re.test(title)) {
      score += r.w;
      if (r.geo) geo += r.geo;
      tags.push(r.tag);
    }
  }
  if (CATALYST_RE.test(title)) tags.push("catalyst");
  return { score: Math.max(-3, Math.min(3, score)), tags, geo: Math.max(-1, Math.min(1.5, geo)) };
}

const recency = (iso: string, now: number) => {
  const ageDays = Math.max(0, (now - new Date(iso).getTime()) / 86400000);
  return Math.max(0.08, Math.exp(-ageDays / 5));
};

/* ------------------------------------------------------------------ */
/* 2. Political regions                                                */
/* ------------------------------------------------------------------ */

const REGIONS: { name: string; re: RegExp }[] = [
  { name: "Middle East", re: /\b(israel|gaza|iran|tehran|hezbollah|lebanon|yemen|houthi|red sea|syria|saudi|iraq|hamas)\b/i },
  { name: "Russia / Ukraine", re: /\b(russia|ukrain\w*|putin|zelensky\w*|kremlin|nato|moscow|kyiv)\b/i },
  { name: "China / Taiwan / Asia-Pacific", re: /\b(china|chinese|taiwan|beijing|xi jinping|south china sea|north korea|pyongyang|japan|india)\b/i },
  { name: "United States", re: /\b(white house|trump|biden|congress|senate|washington|u\.s\.|us economy|treasury|pentagon|republicans?|democrats?)\b/i },
  { name: "Europe", re: /\b(european union|eu\b|ecb|brussels|germany|france|macron|uk\b|britain|italy|eurozone)\b/i },
  { name: "Africa / South Africa", re: /\b(south africa\w*|ramaphosa|rand|anc\b|africa\w*|nigeria|sudan|sahel|congo|ethiopia|pretoria)\b/i },
];

/* ------------------------------------------------------------------ */
/* 3. The 14:30 / 15:30 South African news window                      */
/* ------------------------------------------------------------------ */
// Major US data (NFP, CPI, PPI, jobless claims, retail sales, GDP) is released at 08:30 New York
// time. South Africa is UTC+2 all year, New York shifts with daylight saving, so the release
// lands at 14:30 SAST in US summer time and 15:30 SAST in US winter time.

function partsIn(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, wd: o.weekday };
}

export function nextReleaseWindow(now = new Date()): ReleaseWindow {
  for (let add = 0; add < 9; add++) {
    const probe = new Date(now.getTime() + add * 86400000);
    const ny = partsIn(probe, "America/New_York");
    if (ny.wd === "Sat" || ny.wd === "Sun") continue;
    for (const off of [4, 5]) {
      const t = new Date(Date.UTC(ny.y, ny.m - 1, ny.d, 8 + off, 30));
      const chk = partsIn(t, "America/New_York");
      if (chk.h === 8 && chk.min === 30 && chk.d === ny.d && t.getTime() > now.getTime() - 15 * 60000) {
        const sast = new Intl.DateTimeFormat("en-ZA", {
          timeZone: "Africa/Johannesburg",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(t);
        const sastDate = new Intl.DateTimeFormat("en-ZA", {
          timeZone: "Africa/Johannesburg",
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(t);
        const usDst = off === 4;
        return {
          nextUtc: t.toISOString(),
          sastTime: sast.replace(/[^\d:]/g, ""),
          sastDate,
          etTime: "08:30 New York",
          usDst,
          minutesUntil: Math.round((t.getTime() - now.getTime()) / 60000),
          note: usDst
            ? "US daylight saving is active, so 08:30 New York = 14:30 South African time."
            : "US standard time is active, so 08:30 New York = 15:30 South African time.",
        };
      }
    }
  }
  // fallback (should never happen)
  return {
    nextUtc: now.toISOString(),
    sastTime: "14:30",
    sastDate: "",
    etTime: "08:30 New York",
    usDst: true,
    minutesUntil: 0,
    note: "",
  };
}

/* ------------------------------------------------------------------ */
/* 4. Signal                                                           */
/* ------------------------------------------------------------------ */

const clamp = (n: number, a = -1, b = 1) => Math.max(a, Math.min(b, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

function buildSignal(newsTotal: number, newsCount: number, m: MarketSnapshot): Signal {
  const comps: Component[] = [];

  const newsVal = clamp(Math.tanh(newsTotal / Math.max(15, newsCount * 0.25)));
  comps.push({
    name: "News & politics sentiment",
    value: newsVal,
    weight: 0.45,
    note: `Weighted headline impact ${r1(newsTotal)} across ${newsCount} headlines (${newsVal >= 0 ? "net safe-haven / easing bias" : "net de-escalation / hawkish bias"}).`,
  });

  if (m.gold) {
    const g = m.gold;
    const v = clamp((g.change5d / 3) * 0.6 + ((g.price - g.sma10) / g.sma10) * 100 * 0.4);
    comps.push({
      name: "Gold price momentum",
      value: v,
      weight: 0.25,
      note: `5-day move ${r1(g.change5d)}%, price is ${g.price >= g.sma10 ? "above" : "below"} its 10-day average (${r1(g.sma10)}).`,
    });
  }
  if (m.dxy) {
    comps.push({
      name: "US Dollar",
      value: clamp(-m.dxy.change5d / 1.2),
      weight: 0.15,
      note: `DXY ${r1(m.dxy.change5d)}% over 5 days - a weaker dollar supports gold.`,
    });
  }
  if (m.us10y) {
    comps.push({
      name: "US 10Y yield",
      value: clamp(-m.us10y.change5d / 4),
      weight: 0.1,
      note: `10Y yield ${r1(m.us10y.change5d)}% over 5 days - rising yields pressure gold.`,
    });
  }
  if (m.vix) {
    comps.push({
      name: "Fear (VIX)",
      value: clamp((m.vix.price - 18) / 12),
      weight: 0.05,
      note: `VIX at ${r1(m.vix.price)} - elevated fear favours safe havens.`,
    });
  }

  const totalW = comps.reduce((a, c) => a + c.weight, 0);
  const score = comps.reduce((a, c) => a + c.value * c.weight, 0) / totalW;
  return finalizeSignal(score, comps);
}

function finalizeSignal(score: number, components: Component[]): Signal {
  const action: Action = score > 0.14 ? "BUY" : score < -0.14 ? "SELL" : "HOLD";
  const confidence = Math.round(
    action === "HOLD" ? 40 + (0.14 - Math.abs(score)) * 120 : Math.min(88, 52 + Math.abs(score) * 90),
  );
  return { action, confidence, score: Math.round(score * 1000) / 1000, components };
}

function buildScenarios(signal: Signal, rel: ReleaseWindow, hawk: number, dove: number): Scenario[] {
  const lean =
    signal.action === "BUY"
      ? "Positioning leans bullish going in, so a soft print could extend the move."
      : signal.action === "SELL"
        ? "Positioning leans bearish going in, so a hot print could accelerate the drop."
        : "No strong lean going in, so expect the first reaction to follow the data.";
  return [
    {
      name: `Weak data / dovish tone at ${rel.sastTime} SAST`,
      goldMove: "UP",
      text: `Jobs, CPI or claims below forecast lowers yields and the dollar and raises rate-cut bets. Gold usually spikes within minutes. ${lean}`,
    },
    {
      name: `Strong data / hawkish tone at ${rel.sastTime} SAST`,
      goldMove: "DOWN",
      text: `A beat on jobs or inflation lifts yields and the dollar, which usually sends gold sharply lower. Headlines currently show ${hawk} hawkish vs ${dove} dovish rate signals.`,
    },
    {
      name: "In-line data with geopolitical shock",
      goldMove: "MIXED",
      text: "If the number matches forecasts, price action is usually a fake-out spike followed by a reversal. Wait for the 15-minute candle to close before trusting direction.",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 5. Optional LLM layer (OPENAI_API_KEY)                              */
/* ------------------------------------------------------------------ */

interface LlmOut {
  narrative?: string;
  action?: Action;
  confidence?: number;
  predictions?: Prediction[];
}

async function llmAnalysis(headlines: Headline[], market: MarketSnapshot, signal: Signal, rel: ReleaseWindow): Promise<{ out: LlmOut; model: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const q = (x: MarketSnapshot["gold"]) => (x ? `${r1(x.price)} (1d ${r1(x.change1d)}%, 5d ${r1(x.change5d)}%)` : "n/a");
  const prompt = `You are a macro and geopolitical analyst focused on gold (XAU/USD).
Next major US data release: ${rel.sastDate} at ${rel.sastTime} South African time (08:30 New York).
Market: gold ${q(market.gold)}, DXY ${q(market.dxy)}, US10Y ${q(market.us10y)}, VIX ${q(market.vix)}.
Rule-based signal: ${signal.action} (score ${signal.score}).

Recent and past headlines (newest first, with rule-based gold impact):
${headlines.slice(0, 60).map((h, i) => `${i + 1}. [${h.publishedAt.slice(0, 10)}] ${h.title} (${h.source}) impact=${h.score}`).join("\n")}

Return ONLY JSON: {"narrative": "3-5 sentence summary of the world political situation and what it means for gold",
"action": "BUY"|"SELL"|"HOLD", "confidence": 0-100,
"predictions": [{"title": string, "horizon": string, "direction": "UP"|"DOWN"|"NEUTRAL", "confidence": 0-100, "reasoning": string}] (4-6 items: political/world events and gold)}`;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return { out: JSON.parse(json.choices[0].message.content) as LlmOut, model };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 6. Orchestrator                                                     */
/* ------------------------------------------------------------------ */

function buildRegions(items: Headline[], now: number): RegionOutlook[] {
  const out: RegionOutlook[] = [];
  for (const reg of REGIONS) {
    const matched = items.filter((h) => reg.re.test(h.title));
    let recent = 0;
    let older = 0;
    for (const h of matched) {
      const geo = scoreTitle(h.title).geo;
      const ageDays = (now - new Date(h.publishedAt).getTime()) / 86400000;
      if (ageDays <= 2) recent += geo;
      else older += geo * recency(h.publishedAt, now);
    }
    const raw = Math.max(0, recent + older);
    const risk = Math.round(100 * Math.tanh(raw / 7));
    const recentRate = recent / 2;
    const olderRate = older / 5;
    const trend: RegionOutlook["trend"] = recentRate > olderRate + 0.4 ? "rising" : recentRate < olderRate - 0.4 ? "easing" : "steady";
    const level = risk >= 65 ? "HIGH" : risk >= 35 ? "ELEVATED" : "LOW";
    const impact =
      trend === "rising" && risk >= 35
        ? "Escalating headlines support safe-haven buying of gold."
        : trend === "easing"
          ? "De-escalation is reducing the safe-haven premium; mild gold headwind."
          : risk >= 35
            ? "Persistent tension keeps a floor under gold."
            : "Little direct impact on gold right now.";
    out.push({
      name: reg.name,
      risk,
      trend,
      headlineCount: matched.length,
      outlook: `${level} risk (${risk}/100), ${trend}. ${impact}`,
      topHeadlines: [...matched]
        .sort((a, b) => Math.abs(b.score) * recency(b.publishedAt, now) - Math.abs(a.score) * recency(a.publishedAt, now))
        .slice(0, 3)
        .map((h) => ({ title: h.title, link: h.link, source: h.source })),
    });
  }
  return out.sort((a, b) => b.risk - a.risk);
}

export async function runAnalysis(): Promise<Report> {
  const now = Date.now();
  const [news, mk] = await Promise.all([fetchAllNews(), fetchMarket()]);
  const warnings = [...news.warnings, ...mk.warnings];

  const scored: Headline[] = news.items.map((it: RawItem) => {
    const s = scoreTitle(it.title);
    return { ...it, score: s.score, tags: s.tags };
  });
  scored.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  let newsTotal = 0;
  let hawk = 0;
  let dove = 0;
  for (const h of scored) {
    newsTotal += h.score * recency(h.publishedAt, now);
    if (h.tags.includes("hawkish")) hawk++;
    if (h.tags.includes("monetary-easing")) dove++;
  }

  const release = nextReleaseWindow(new Date(now));
  let signal = buildSignal(newsTotal, scored.length, mk.market);
  const regions = buildRegions(scored, now);

  // Top headlines: the most market-moving, recent first
  const top = [...scored]
    .filter((h) => h.score !== 0 || h.tags.includes("catalyst"))
    .sort((a, b) => (Math.abs(b.score) + 0.5) * recency(b.publishedAt, now) - (Math.abs(a.score) + 0.5) * recency(a.publishedAt, now))
    .slice(0, 25);

  // Rule-based predictions
  const g = mk.market.gold;
  const predictions: Prediction[] = [];
  predictions.push({
    title: `Gold reaction at the ${release.sastTime} SAST release`,
    horizon: "Next 1-4 hours",
    direction: signal.action === "BUY" ? "UP" : signal.action === "SELL" ? "DOWN" : "NEUTRAL",
    confidence: signal.confidence,
    reasoning: `Composite model score ${signal.score} (${signal.action}). Biggest driver: ${[...signal.components].sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight))[0]?.name}.`,
  });
  if (g) {
    const up = g.price > g.sma10 && g.change5d > 0;
    predictions.push({
      title: "Gold trend for the coming week",
      horizon: "1 week",
      direction: up ? "UP" : g.price < g.sma10 && g.change5d < 0 ? "DOWN" : "NEUTRAL",
      confidence: Math.round(45 + Math.min(30, Math.abs(g.change5d) * 6)),
      reasoning: `Gold at ${r1(g.price)} is ${up ? "holding above" : "trading below"} its 10-day average with a ${r1(g.change5d)}% 5-day change.`,
    });
  }
  for (const r of regions.slice(0, 3)) {
    if (r.risk < 20) continue;
    predictions.push({
      title: `${r.name}: ${r.trend} tension`,
      horizon: "1-4 weeks",
      direction: r.trend === "easing" ? "DOWN" : "UP",
      confidence: Math.round(40 + r.risk * 0.35),
      reasoning: r.outlook,
    });
  }
  predictions.push({
    title: "Federal Reserve policy lean",
    horizon: "Next FOMC cycle",
    direction: dove > hawk ? "UP" : dove < hawk ? "DOWN" : "NEUTRAL",
    confidence: Math.round(40 + Math.min(30, Math.abs(dove - hawk) * 4)),
    reasoning: `${dove} dovish/easing headlines vs ${hawk} hawkish/tightening headlines. ${dove > hawk ? "Markets lean toward easier policy, which is positive for gold." : dove < hawk ? "Markets lean hawkish (higher yields), which is a headwind for gold." : "No clear lean."}`,
  });

  let narrative = `Across ${scored.length} headlines the news flow is ${signal.components[0].value > 0.1 ? "net supportive" : signal.components[0].value < -0.1 ? "net negative" : "balanced"} for gold. Highest political risk: ${regions[0]?.name} (${regions[0]?.risk}/100, ${regions[0]?.trend}). The next major US data release is ${release.sastDate} at ${release.sastTime} South African time.`;

  let mode: Report["mode"] = "heuristic";
  let model: string | undefined;
  const llm = await llmAnalysis(scored, mk.market, signal, release);
  if (llm) {
    mode = "heuristic+llm";
    model = llm.model;
    if (llm.out.narrative) narrative = llm.out.narrative;
    if (Array.isArray(llm.out.predictions) && llm.out.predictions.length) {
      predictions.splice(1, predictions.length, ...llm.out.predictions.slice(0, 6));
    }
    if (llm.out.action && ["BUY", "SELL", "HOLD"].includes(llm.out.action)) {
      const dir = llm.out.action === "BUY" ? 1 : llm.out.action === "SELL" ? -1 : 0;
      const llmVal = dir * clamp((llm.out.confidence ?? 60) / 100, 0, 1);
      const comps = [
        ...signal.components,
        { name: `AI analyst (${llm.model})`, value: llmVal, weight: 0.4, note: `LLM says ${llm.out.action} (${llm.out.confidence ?? "?"}% confidence).` },
      ];
      const totalW = comps.reduce((a, c) => a + c.weight, 0);
      signal = finalizeSignal(comps.reduce((a, c) => a + c.value * c.weight, 0) / totalW, comps);
      predictions[0].direction = signal.action === "BUY" ? "UP" : signal.action === "SELL" ? "DOWN" : "NEUTRAL";
      predictions[0].confidence = signal.confidence;
    }
  } else if (process.env.OPENAI_API_KEY) {
    warnings.push("OPENAI_API_KEY is set but the LLM call failed - using rule-based analysis only.");
  }

  return {
    generatedAt: new Date(now).toISOString(),
    mode,
    model,
    release,
    market: mk.market,
    signal,
    scenarios: buildScenarios(signal, release, hawk, dove),
    regions,
    predictions,
    headlines: top,
    narrative,
    stats: { headlinesAnalyzed: scored.length, sources: news.ok, failedSources: news.failed },
    warnings,
  };
}
