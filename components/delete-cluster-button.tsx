"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteClusterButton({ clusterId }: { clusterId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function deleteCluster() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/clusters/delete", {
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
        alert(data.error ?? "刪除 cluster 失敗");
        return;
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "刪除 cluster 失敗");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <button
      onClick={deleteCluster}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
        confirming
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {loading ? "Deleting..." : confirming ? "Confirm delete" : "Delete"}
    </button>
  );
}