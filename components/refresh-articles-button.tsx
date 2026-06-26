"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshArticlesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshArticles() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/cron/ingest", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "重新搜尋失敗");
        return;
      }

      setMessage(
        `完成：更新 ${data.upserted} 篇，略過 ${data.skipped} 篇，刪除舊文 ${data.deleted_old_articles} 篇`
      );

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新搜尋失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={refreshArticles}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "重新搜尋中..." : "重新搜尋"}
      </button>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </div>
  );
}