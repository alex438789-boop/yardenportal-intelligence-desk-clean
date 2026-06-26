"use client";

import { useState } from "react";
import { Draft, Topic } from "@/lib/types";

export function GenerateDraftButton({ topic }: { topic: Topic }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateDraft() {
    setLoading(true);
    setError(null);
    setDraft(null);

    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || "API did not return JSON.");
      }

      if (!res.ok) {
        throw new Error(data.error || data.details || `Request failed with status ${res.status}`);
      }

      if (!data.draft) {
        throw new Error("API response did not include a draft.");
      }

      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error while generating draft.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button onClick={generateDraft} disabled={loading} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
        {loading ? "生成中…" : "生成 YardenPORTAL 草稿"}
      </button>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">生成失敗</p>
          <p className="mt-1 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {draft && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">{draft.igTitle}</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{draft.caption}</pre>
          <p className="mt-4 text-xs text-slate-500">Hashtags: {draft.hashtags.join(" ")}</p>
        </div>
      )}
    </div>
  );
}
