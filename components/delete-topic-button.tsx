"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteTopicButton({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function deleteTopic() {
    const confirmed = window.confirm(
      "確定要刪除這個 topic 嗎？相關 drafts 不會一起刪除。"
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch("/api/topics/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topicId }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        alert(data.error ?? "刪除失敗");
        return;
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "刪除失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={deleteTopic}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      {loading ? "刪除中..." : "刪除"}
    </button>
  );
}