/**
 * Standalone entry point - no database or web server needed.
 * Run locally:   npx tsx bot/run.ts
 * Run on GitHub: see .github/workflows/gold-bot.yml
 *
 * Writes reports/latest.json, reports/latest.md and reports/history/<timestamp>.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runAnalysis } from "../src/lib/bot/analyze";
import { notify, toMarkdown } from "../src/lib/bot/format";

async function main() {
  console.log("Surfing the web for news and market data...");
  const report = await runAnalysis();
  const md = toMarkdown(report);

  mkdirSync("reports/history", { recursive: true });
  writeFileSync("reports/latest.json", JSON.stringify(report, null, 2));
  writeFileSync("reports/latest.md", md);
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  writeFileSync(`reports/history/${stamp}.md`, md);

  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: "a" });
  }

  const sent = await notify(report);
  if (sent.length) console.log("Notifications sent:", sent.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
