import { integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Report } from "@/lib/bot/types";

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  action: text("action").notNull(),
  confidence: integer("confidence").notNull(),
  score: real("score").notNull(),
  data: jsonb("data").$type<Report>().notNull(),
});
