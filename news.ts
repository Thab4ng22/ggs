// Surfs the web for news: Google News RSS searches (no API key) + direct world-news feeds.

export interface RawItem {
  title: string;
  source: string;
  link: string;
  publishedAt: string;
  query: string;
}

const UA =
  "Mozilla/5.0 (compatible; GoldPoliticsBot/1.0; +https://github.com) AppleWebKit/537.36 Chrome/124 Safari/537.36";

const gnews = (q: string, when: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${when}`)}&hl=en-US&gl=US&ceid=US:en`;

// "when" gives the bot a window of recent AND past events (2 days up to 30 days back)
export const FEEDS: { name: string; url: string }[] = [
  { name: "gold price", url: gnews("gold price", "2d") },
  { name: "gold outlook", url: gnews("gold forecast OR bullion OR XAUUSD", "3d") },
  { name: "fed & rates", url: gnews("Federal Reserve interest rates", "3d") },
  { name: "us data", url: gnews("CPI inflation OR nonfarm payrolls OR jobless claims", "3d") },
  { name: "geopolitics", url: gnews("war OR ceasefire OR sanctions geopolitics", "3d") },
  { name: "middle east", url: gnews("Israel Iran Gaza Middle East", "7d") },
  { name: "russia ukraine", url: gnews("Russia Ukraine war", "7d") },
  { name: "china taiwan trade", url: gnews("China Taiwan tariffs trade war", "7d") },
  { name: "us politics", url: gnews("White House Congress Trump politics", "7d") },
  { name: "europe politics", url: gnews("European Union ECB election politics", "7d") },
  { name: "africa politics", url: gnews("South Africa OR Africa politics rand", "7d") },
  { name: "central bank gold buying", url: gnews("central banks buying gold reserves", "30d") },
  { name: "recession & crisis", url: gnews("recession OR banking crisis OR debt crisis", "30d") },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
];

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

export function parseRss(xml: string, feedName: string, limit = 25): RawItem[] {
  const items: RawItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks.slice(0, limit)) {
    let title = tag(b, "title");
    let source = tag(b, "source");
    // Google News appends " - Source" to titles
    if (!source && feedName) source = feedName;
    const idx = title.lastIndexOf(" - ");
    if (idx > 20) {
      const tail = title.slice(idx + 3);
      if (tail.length < 40) {
        if (!tag(b, "source")) source = tail;
        title = title.slice(0, idx);
      }
    }
    const d = new Date(tag(b, "pubDate"));
    if (!title) continue;
    items.push({
      title,
      source,
      link: tag(b, "link"),
      publishedAt: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
      query: feedName,
    });
  }
  return items;
}

export async function fetchAllNews(): Promise<{ items: RawItem[]; ok: number; failed: number; warnings: string[] }> {
  const warnings: string[] = [];
  const results = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        return { ok: true, items: parseRss(xml, f.name) };
      } catch (e) {
        warnings.push(`Feed "${f.name}" failed: ${(e as Error).message}`);
        return { ok: false, items: [] as RawItem[] };
      }
    }),
  );

  const seen = new Set<string>();
  const items: RawItem[] = [];
  for (const r of results) {
    for (const it of r.items) {
      const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  }
  return {
    items,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    warnings,
  };
}
