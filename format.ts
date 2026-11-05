import type { Report } from "./types";

const arrow = (d: string) => (d === "UP" ? "▲" : d === "DOWN" ? "▼" : "▬");

export function toMarkdown(r: Report): string {
  const g = r.market.gold;
  const L: string[] = [];
  L.push(`# Gold & World Politics Report`);
  L.push(`_Generated ${r.generatedAt} · mode: ${r.mode}${r.model ? ` (${r.model})` : ""}_`);
  L.push("");
  L.push(`## Signal: **${r.signal.action}** (${r.signal.confidence}% confidence, score ${r.signal.score})`);
  L.push(`Next US news window: **${r.release.sastDate} at ${r.release.sastTime} SAST** (${r.release.etTime}). ${r.release.note}`);
  if (g) L.push(`Gold: **$${g.price.toFixed(2)}** (1d ${g.change1d.toFixed(2)}%, 5d ${g.change5d.toFixed(2)}%)`);
  L.push("");
  L.push(`## Summary`);
  L.push(r.narrative);
  L.push("");
  L.push(`## Signal breakdown`);
  for (const c of r.signal.components) L.push(`- **${c.name}** (${c.value.toFixed(2)}, weight ${c.weight}): ${c.note}`);
  L.push("");
  L.push(`## Scenarios at the release`);
  for (const s of r.scenarios) L.push(`- ${arrow(s.goldMove)} **${s.name}** - ${s.text}`);
  L.push("");
  L.push(`## Predictions`);
  for (const p of r.predictions)
    L.push(`- ${arrow(p.direction)} **${p.title}** (${p.horizon}, ${p.confidence}%): ${p.reasoning}`);
  L.push("");
  L.push(`## World political risk`);
  for (const x of r.regions) L.push(`- **${x.name}** - ${x.outlook}`);
  L.push("");
  L.push(`## Key headlines`);
  for (const h of r.headlines.slice(0, 15))
    L.push(`- [${h.score > 0 ? "+" : ""}${h.score.toFixed(1)}] [${h.title}](${h.link}) - ${h.source}`);
  L.push("");
  L.push(`> Not financial advice. This is an automated, heuristic model - markets can move against any signal.`);
  return L.join("\n");
}

export function toShortMessage(r: Report): string {
  const g = r.market.gold;
  return [
    `GOLD ${r.signal.action} (${r.signal.confidence}%)`,
    `News window: ${r.release.sastTime} SAST ${r.release.sastDate}`,
    g ? `XAU/USD ~ $${g.price.toFixed(2)} (5d ${g.change5d.toFixed(2)}%)` : "",
    `Top risk: ${r.regions[0]?.name} ${r.regions[0]?.risk}/100 (${r.regions[0]?.trend})`,
    r.narrative.slice(0, 400),
    "Not financial advice.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Optional push notifications: Telegram and/or Discord/Slack-style webhook. */
export async function notify(r: Report): Promise<string[]> {
  const msg = toShortMessage(r);
  const done: string[] = [];
  const tg = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (tg && chat) {
    const res = await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: msg }),
    });
    done.push(`telegram:${res.status}`);
  }
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (hook) {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg }),
    });
    done.push(`discord:${res.status}`);
  }
  return done;
}
