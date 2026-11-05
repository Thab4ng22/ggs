import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: reports.id,
      createdAt: reports.createdAt,
      action: reports.action,
      confidence: reports.confidence,
      score: reports.score,
    })
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(20);
  return NextResponse.json({ reports: rows });
}
