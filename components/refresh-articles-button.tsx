"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshArticlesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshArticlesAndClusters() {
    setLoading(true);
    setMessage("正在重新搜尋新聞...");

    try {
      const ingestResponse = await fetch("/api/cron/ingest", {
        method: "GET",
        cache: "no-store",
      });

      const ingestData = await ingestResponse.json();

      if (!ingestResponse.ok || !ingestData.ok) {
        setMessage(ingestData.error ?? "重新搜尋新聞失敗");
        return;
      }

      setMessage("新聞更新完成，正在重建事件群組...");

      const clustersResponse = await fetch("/api/clusters/rebuild", {
        method: "GET",
        cache: "no-store",
      });

      const clustersData = await clustersResponse.json();

      if (!clustersResponse.ok || !clustersData.ok) {
        setMessage(clustersData.error ?? "重建 clusters 失敗");
        return;
      }

      setMessage(
        `完成：更新 ${ingestData.upserted} 篇，略過 ${ingestData.skipped} 篇，刪除舊文 ${ingestData.deleted_old_articles} 篇，重建 ${clustersData.clusters} 個 clusters`
      );

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新整理失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={refreshArticlesAndClusters}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "處理中..." : "重新搜尋＋重建 Clusters"}
      </button>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </div>
  );
}