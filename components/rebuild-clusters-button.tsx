"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function RebuildClustersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function rebuildClusters() {
    setLoading(true);
    setMessage("正在重建事件群組...");

    try {
      const response = await fetch("/api/clusters/rebuild", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "重建 clusters 失敗");
        return;
      }

      setMessage(
        `完成：讀取 ${data.articles} 篇 articles，重建 ${data.clusters} 個 clusters`
      );

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重建 clusters 失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={rebuildClusters}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "重建中..." : "重建 Clusters"}
      </button>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </div>
  );
}