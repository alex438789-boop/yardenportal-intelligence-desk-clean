"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";

export function GenerateClusterAiButton({
  clusterId,
}: {
  clusterId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function generateAi() {
    setLoading(true);
    setMessage("Gemini 正在生成標題與摘要...");

    try {
      const response = await fetch("/api/clusters/generate-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          clusterId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Gemini 生成失敗");
        return;
      }

      setMessage("已更新 Gemini 標題與摘要");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gemini 生成失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={generateAi}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
      >
        <Sparkles className={`h-3.5 w-3.5 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Generating..." : "Generate AI"}
      </button>

      {message && <span className="text-xs text-slate-400">{message}</span>}
    </div>
  );
}