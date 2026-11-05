import { NextResponse } from "next/server";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { runAnalysis } from "@/lib/bot/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const report = await runAnalysis();
    const [row] = await db
      .insert(reports)
      .values({
        action: report.signal.action,
        confidence: report.signal.confidence,
        score: report.signal.score,
        data: report,
      })
      .returning({ id: reports.id });
    return NextResponse.json({ id: row.id, report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
