import { desc } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [latest] = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(1);
  return <Dashboard initial={latest?.data ?? null} initialAt={latest ? latest.createdAt.toISOString() : null} />;
}
