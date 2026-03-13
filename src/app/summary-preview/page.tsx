"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  buildReportMarkdown,
  parseStoredSummaryDocument,
  SUMMARY_STORAGE_KEY,
} from "@/lib/summary-document";

export default function SummaryPreviewPage() {
  const [mode, setMode] = useState<"rendered" | "markdown" | "report">("rendered");
  const [document] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return parseStoredSummaryDocument(window.localStorage.getItem(SUMMARY_STORAGE_KEY));
  });

  const summaryMarkdown = document?.summaryMarkdown || "";
  const reportMarkdown = document ? buildReportMarkdown(document) : "";

  function renderContent() {
    if (!document) {
      return (
        <p className="text-slate-500">
          目前沒有可預覽的摘要內容。請先回主頁產生摘要。
        </p>
      );
    }

    if (mode === "markdown") {
      return (
        <textarea
          className="min-h-[70vh] w-full resize-y rounded-3xl border border-slate-200 bg-white px-5 py-4 font-mono text-sm leading-7 text-slate-800 outline-none"
          readOnly
          value={summaryMarkdown}
        />
      );
    }

    if (mode === "report") {
      return (
        <textarea
          className="min-h-[70vh] w-full resize-y rounded-3xl border border-slate-200 bg-white px-5 py-4 font-mono text-sm leading-7 text-slate-800 outline-none"
          readOnly
          value={reportMarkdown}
        />
      );
    }

    return (
      <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:mt-8 prose-h2:text-2xl prose-li:marker:text-slate-500">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {summaryMarkdown}
        </ReactMarkdown>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5efe2] px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-4xl border border-slate-200 bg-white/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">
            Markdown Preview
          </p>
          <h1 className="mt-3 text-3xl font-semibold">摘要 .md 預覽</h1>
          <p className="mt-3 text-slate-600">
            這裡可切換 Markdown 排版預覽、原始 .md 文字，以及包含 OCR 原文的完整報告內容。
          </p>
        </header>

        <section className="rounded-4xl border border-slate-200 bg-white/80 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "rendered" ? "bg-slate-950 text-white" : "border border-slate-300 text-slate-700 hover:bg-white"}`}
              onClick={() => setMode("rendered")}
              type="button"
            >
              排版預覽
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "markdown" ? "bg-slate-950 text-white" : "border border-slate-300 text-slate-700 hover:bg-white"}`}
              onClick={() => setMode("markdown")}
              type="button"
            >
              原始摘要 .md
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "report" ? "bg-slate-950 text-white" : "border border-slate-300 text-slate-700 hover:bg-white"}`}
              onClick={() => setMode("report")}
              type="button"
            >
              完整報告 .md
            </button>
          </div>
          <div className="min-h-[70vh] rounded-3xl border border-slate-200 bg-white px-5 py-4">
            {renderContent()}
          </div>
        </section>
      </div>
    </main>
  );
}