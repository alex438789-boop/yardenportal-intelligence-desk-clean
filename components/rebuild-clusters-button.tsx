"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

export function RebuildClustersButton() {
  const router = useRouter();
  const [loadingMode, setLoadingMode] = useState<"normal" | "ai" | null>(null);
  const [message, setMessage] = useState("");

  async function rebuildClusters(withAi: boolean) {
    const mode = withAi ? "ai" : "normal";

    setLoadingMode(mode);
    setMessage(
      withAi
        ? "正在重建 clusters，並使用 Gemini 生成標題與摘要..."
        : "正在重建 clusters..."
    );

    try {
      const endpoint = withAi
        ? "/api/clusters/rebuild?ai=1"
        : "/api/clusters/rebuild";

      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "重建 clusters 失敗");
        return;
      }

      setMessage(
        withAi
          ? `完成：讀取 ${data.articles} 篇 articles，重建 ${data.clusters} 個 clusters，Gemini 生成 ${data.gemini_generated_clusters ?? 0} 個`
          : `完成：讀取 ${data.articles} 篇 articles，重建 ${data.clusters} 個 clusters`
      );

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重建 clusters 失敗");
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => rebuildClusters(false)}
          disabled={loadingMode !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loadingMode === "normal" ? "animate-spin" : ""
            }`}
          />
          {loadingMode === "normal" ? "重建中..." : "重新 Clusters"}
        </button>

        <button
          onClick={() => rebuildClusters(true)}
          disabled={loadingMode !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          <Sparkles
            className={`h-4 w-4 ${
              loadingMode === "ai" ? "animate-pulse" : ""
            }`}
          />
          {loadingMode === "ai" ? "AI 生成中..." : "重新 Clusters + AI"}
        </button>
      </div>

      {message && <p className="text-sm text-slate-500">{message}</p>}
    </div>
  );
}