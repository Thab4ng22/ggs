"use client";

import { useCallback, useEffect, useState } from "react";
import type { Report } from "@/lib/bot/types";

const actionStyle = {
  BUY: "from-emerald-500/30 to-emerald-900/10 border-emerald-500/50 text-emerald-300",
  SELL: "from-rose-500/30 to-rose-900/10 border-rose-500/50 text-rose-300",
  HOLD: "from-amber-500/30 to-amber-900/10 border-amber-500/50 text-amber-300",
} as const;

const dirColor = (d: string) => (d === "UP" ? "text-emerald-400" : d === "DOWN" ? "text-rose-400" : "text-slate-400");
const dirIcon = (d: string) => (d === "UP" ? "▲" : d === "DOWN" ? "▼" : "▬");
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

function useCountdown(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Released / live now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d ? `${d}d ` : ""}${h}h ${m}m ${s % 60}s`;
}

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 200},${40 - ((v - min) / (max - min || 1)) * 36 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 200 40" className="h-10 w-full">
      <polyline fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="2" points={pts} />
    </svg>
  );
}

export default function Dashboard({ initial, initialAt }: { initial: Report | null; initialAt: string | null }) {
  const [report, setReport] = useState<Report | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analysis failed");
      setReport(json.report as Report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initial) void run();
  }, [initial, run]);

  const countdown = useCountdown(report?.release.nextUtc ?? new Date().toISOString());

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">Gold · Geopolitics · AI</p>
          <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">World Politics &amp; Gold Forecast Bot</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reads global news, scores world political risk and predicts how gold reacts to the 14:30 / 15:30 SAST US news release.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Surfing the web…" : "Run analysis now"}
        </button>
      </header>

      {error && <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      {!report && loading && (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-300">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          Fetching news from 16 sources and live market data. This takes 10-30 seconds…
        </div>
      )}

      {report && (
        <>
          {/* Signal + release */}
          <section className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className={`rounded-2xl border bg-gradient-to-br p-6 ${actionStyle[report.signal.action]}`}>
              <p className="text-xs uppercase tracking-widest opacity-80">Gold signal</p>
              <p className="mt-2 text-6xl font-black tracking-tight">{report.signal.action}</p>
              <p className="mt-2 text-sm opacity-90">
                {report.signal.confidence}% confidence · score {report.signal.score}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
                <div className="h-full bg-current" style={{ width: `${report.signal.confidence}%` }} />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs uppercase tracking-widest text-slate-400">Next US news window</p>
              <p className="mt-2 text-4xl font-bold text-white">{report.release.sastTime} <span className="text-lg text-slate-400">SAST</span></p>
              <p className="text-sm text-slate-300">{report.release.sastDate} · {report.release.etTime}</p>
              <p className="mt-3 font-mono text-lg text-amber-300">{countdown}</p>
              <p className="mt-2 text-xs text-slate-400">{report.release.note}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-xs uppercase tracking-widest text-slate-400">Gold (XAU/USD)</p>
              {report.market.gold ? (
                <>
                  <p className="mt-2 text-4xl font-bold text-white">${report.market.gold.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  <p className={`text-sm ${report.market.gold.change1d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {pct(report.market.gold.change1d)} today · {pct(report.market.gold.change5d)} 5d
                  </p>
                  <Spark data={report.market.gold.series} up={report.market.gold.change5d >= 0} />
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Live price unavailable.</p>
              )}
            </div>
          </section>

          {/* Narrative */}
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">Analyst summary</h2>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                {report.mode === "heuristic+llm" ? `AI + rules (${report.model})` : "Rule-based engine"} · {report.stats.headlinesAnalyzed} headlines · {report.stats.sources} sources
              </span>
            </div>
            <p className="mt-3 leading-relaxed text-slate-200">{report.narrative}</p>
            <p className="mt-2 text-xs text-slate-500">
              Updated {new Date(report.generatedAt).toLocaleString()}
              {initialAt && report === initial ? " (last saved run)" : ""}
            </p>
          </section>

          {/* Market + components */}
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white">What drives the signal</h2>
              <ul className="mt-4 space-y-4">
                {report.signal.components.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-100">{c.name}</span>
                      <span className={c.value >= 0 ? "text-emerald-400" : "text-rose-400"}>{c.value >= 0 ? "+" : ""}{c.value.toFixed(2)}</span>
                    </div>
                    <div className="relative mt-1 h-1.5 rounded-full bg-white/10">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-white/30" />
                      <div
                        className={`absolute top-0 h-full rounded-full ${c.value >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                        style={{ left: c.value >= 0 ? "50%" : `${50 + c.value * 50}%`, width: `${Math.abs(c.value) * 50}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{c.note}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                {[report.market.dxy, report.market.us10y, report.market.vix].map((q) =>
                  q ? (
                    <div key={q.symbol} className="rounded-lg bg-black/20 p-2">
                      <p className="text-slate-400">{q.label}</p>
                      <p className="text-base font-semibold text-white">{q.price.toFixed(2)}</p>
                      <p className={q.change5d >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(q.change5d)} 5d</p>
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white">Scenarios at the release</h2>
              <ul className="mt-4 space-y-3">
                {report.scenarios.map((s) => (
                  <li key={s.name} className="rounded-xl bg-black/20 p-4">
                    <p className={`font-semibold ${dirColor(s.goldMove === "MIXED" ? "NEUTRAL" : s.goldMove)}`}>
                      {s.goldMove === "UP" ? "▲" : s.goldMove === "DOWN" ? "▼" : "↕"} {s.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-300">{s.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Predictions */}
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Predictions</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {report.predictions.map((p, i) => (
                <div key={i} className="rounded-xl bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white">{p.title}</p>
                    <span className={`whitespace-nowrap text-sm font-bold ${dirColor(p.direction)}`}>
                      {dirIcon(p.direction)} {p.direction}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{p.horizon} · {p.confidence}% confidence</p>
                  <p className="mt-2 text-sm text-slate-300">{p.reasoning}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Regions */}
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">World political risk map</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {report.regions.map((r) => (
                <div key={r.name} className="rounded-xl bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white">{r.name}</p>
                    <span className="text-xs text-slate-400">{r.trend === "rising" ? "↑ rising" : r.trend === "easing" ? "↓ easing" : "→ steady"}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full ${r.risk >= 65 ? "bg-rose-500" : r.risk >= 35 ? "bg-amber-400" : "bg-emerald-400"}`}
                      style={{ width: `${Math.max(4, r.risk)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-300">{r.outlook}</p>
                  <ul className="mt-2 space-y-1">
                    {r.topHeadlines.map((h) => (
                      <li key={h.link} className="text-xs">
                        <a href={h.link} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{h.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Headlines */}
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Market-moving headlines</h2>
            <ul className="mt-4 divide-y divide-white/10">
              {report.headlines.map((h) => (
                <li key={h.link} className="flex items-start gap-3 py-2.5">
                  <span className={`mt-0.5 w-12 shrink-0 rounded-md px-1.5 py-0.5 text-center text-xs font-bold ${h.score > 0 ? "bg-emerald-500/20 text-emerald-300" : h.score < 0 ? "bg-rose-500/20 text-rose-300" : "bg-white/10 text-slate-300"}`}>
                    {h.score > 0 ? "+" : ""}{h.score.toFixed(1)}
                  </span>
                  <div className="min-w-0">
                    <a href={h.link} target="_blank" rel="noreferrer" className="text-sm text-slate-100 hover:underline">{h.title}</a>
                    <p className="text-xs text-slate-500">{h.source} · {new Date(h.publishedAt).toLocaleDateString()} {h.tags.length ? `· ${h.tags.join(", ")}` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {report.warnings.length > 0 && (
            <details className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-200">
              <summary className="cursor-pointer">{report.warnings.length} data warnings</summary>
              <ul className="mt-2 list-disc pl-5">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </>
      )}

      <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-slate-500">
        Not financial advice. Automated heuristic forecasts can be wrong; never risk money you can&apos;t afford to lose.
      </footer>
    </main>
  );
}
