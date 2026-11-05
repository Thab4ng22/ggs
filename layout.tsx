import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Politics & Gold Forecast Bot",
  description: "AI bot that reads world news and political risk and forecasts gold buy/sell ahead of the 14:30 / 15:30 SAST US news.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
