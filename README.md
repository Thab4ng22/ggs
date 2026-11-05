# World Politics & Gold Forecast Bot

A bot that surfs the internet (16 news feeds + live market data), scores world political
risk, and forecasts whether **gold** is a **BUY / SELL / HOLD** going into the big US news
release at **14:30 or 15:30 South African time**.

## Why 14:30 vs 15:30?
US data (NFP jobs, CPI, PPI, jobless claims, retail sales, GDP) drops at **08:30 New York time**.
South Africa is UTC+2 all year, but New York changes with daylight saving:

| US time of year | 08:30 New York | South Africa |
|---|---|---|
| Summer (EDT) | 12:30 UTC | **14:30** |
| Winter (EST) | 13:30 UTC | **15:30** |

The bot works out the correct one automatically.

## What it does
1. Pulls headlines (recent + up to 30 days back) from Google News searches, BBC, Al Jazeera, NYT.
2. Scores every headline for gold impact (war/sanctions/rate cuts = bullish; ceasefire/hawkish Fed/strong dollar = bearish), weighting recent news more.
3. Builds a political-risk score for the Middle East, Russia/Ukraine, China/Asia, US, Europe and Africa, with rising/easing trends.
4. Pulls gold, Dollar Index, US 10Y yield and VIX from Yahoo Finance.
5. Blends everything into a signal with confidence and "weak data / strong data" scenarios.
6. (Optional) Adds an LLM analyst if `OPENAI_API_KEY` is set.

## Run it on GitHub (free, automatic)
1. Push this repo to GitHub.
2. Go to **Actions** and enable workflows. `.github/workflows/gold-bot.yml` runs Mon-Fri about 45 min **before** each possible window (11:45 and 12:45 UTC = 13:45 / 14:45 SAST).
3. Each run commits `reports/latest.md`, `reports/latest.json` and a timestamped copy in `reports/history/`, and writes the report to the run summary page.
4. Press **Run workflow** to run it manually any time.

Optional secrets (Settings > Secrets and variables > Actions):
`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`. Optional variable: `OPENAI_MODEL`.
GitHub cron can be delayed by several minutes, hence the early start.

## Run locally
```bash
npm install
npx tsx bot/run.ts        # prints the report and writes reports/
```

## Run the dashboard
```bash
npm run dev               # needs DATABASE_URL (PostgreSQL), then `npx drizzle-kit push`
```
Open the page and press **Run analysis now**. Reports are saved in PostgreSQL.

> Not financial advice. The model is heuristic; markets can move against any signal.
