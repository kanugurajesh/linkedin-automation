import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { togglePause } from "./actions";
import { Rail } from "./_components/rail";
import { brand } from "../../config/brand";
import { isPaused, listDrafts } from "@/lib/queue-core";

const grotesk = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: "Post desk",
  description: "Review, schedule and track your LinkedIn posts",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // everything reads live DB state
  const [paused, drafts] = await Promise.all([isPaused(), listDrafts()]);
  const toReview = drafts.filter((d) => d.status === "draft" || d.status === "failed").length;
  const scheduled = drafts.filter((d) => d.status === "scheduled").length;

  return (
    <html lang="en" className={`${grotesk.variable} h-full`}>
      <body className="min-h-full">
        <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
          <Rail name={brand.name} toReview={toReview} scheduled={scheduled} paused={paused} togglePause={togglePause} />
          <main className="px-5 py-8 md:px-12 md:py-12">
            <div className="mx-auto max-w-5xl">
              {process.env.DEMO_MODE === "1" ? (
                <p className="mb-8 border-l-4 border-proof bg-paper px-4 py-3 text-[15px] leading-relaxed">
                  <span className="font-semibold">Demo with sample data.</span> Everything you see is made up. Writing, visuals and publishing are switched off; editing, scheduling and rejecting drafts work.
                </p>
              ) : null}
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
