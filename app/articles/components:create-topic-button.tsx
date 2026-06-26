

"use client";

import { useState } from "react";

export function CreateTopicButton({ articleId }: { articleId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function createTopic() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/topics/from-article", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ articleId }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to create topic");
      }

      setMessage("已建立 topic");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "建立失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        onClick={createTopic}
        disabled={loading}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading ? "建立中..." : "Create Topic"}
      </button>

      {message && <span className="text-sm text-slate-500">{message}</span>}
    </div>
  );
}