import type { MarketSnapshot, Quote } from "./types";

const UA = "Mozilla/5.0 (compatible; GoldPoliticsBot/1.0) AppleWebKit/537.36 Chrome/124 Safari/537.36";

async function quote(symbol: string, label: string): Promise<Quote | null> {
  const hosts = ["query1", "query2"];
  for (const h of hosts) {
    try {
      const url = `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        chart?: {
          result?: {
            meta?: { regularMarketPrice?: number };
            indicators?: { quote?: { close?: (number | null)[] }[] };
          }[];
        };
      };
      const r = json.chart?.result?.[0];
      const closes = (r?.indicators?.quote?.[0]?.close ?? []).filter((x): x is number => typeof x === "number");
      if (closes.length < 6) continue;
      const price = r?.meta?.regularMarketPrice ?? closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      const prev5 = closes[closes.length - 6];
      const last10 = closes.slice(-10);
      const sma10 = last10.reduce((a, b) => a + b, 0) / last10.length;
      return {
        symbol,
        label,
        price,
        change1d: ((price - prev) / prev) * 100,
        change5d: ((price - prev5) / prev5) * 100,
        sma10,
        series: closes.slice(-20),
      };
    } catch {
      // try next host
    }
  }
  return null;
}

export async function fetchMarket(): Promise<{ market: MarketSnapshot; warnings: string[] }> {
  const [gold, dxy, us10y, vix] = await Promise.all([
    quote("GC=F", "Gold (XAU/USD futures)"),
    quote("DX-Y.NYB", "US Dollar Index"),
    quote("^TNX", "US 10Y Yield"),
    quote("^VIX", "VIX (fear gauge)"),
  ]);
  const warnings: string[] = [];
  if (!gold) warnings.push("Could not fetch live gold price - signal relies on news only.");
  if (!dxy) warnings.push("Could not fetch Dollar Index.");
  if (!us10y) warnings.push("Could not fetch US 10Y yield.");
  if (!vix) warnings.push("Could not fetch VIX.");
  return { market: { gold, dxy, us10y, vix }, warnings };
}
