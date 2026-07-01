"use client";

import { useState } from "react";
import { Brain, ChevronDown, Loader2, Network } from "lucide-react";
import { useRouter } from "next/navigation";

type EventFamily = {
  zh_title: string;
  event_scope: string;
  region: string;
  category: string;
  article_ids: string[];
  why_it_matters: string;
  recommendation: string;
  confidence: number;
};

type SingletonCandidate = {
  zh_title: string;
  article_ids: string[];
  reason: string;
  suggested_action: string;
  confidence: number;
};

type OverclusterRisk = {
  zh_title: string;
  article_ids: string[];
  reason: string;
  suggested_action: string;
  confidence: number;
};

type CoverageSummary = {
  main_observation: string;
  why_clusters_may_be_unbalanced: string;
  recommended_next_step: string;
};

type PoolAnalysis = {
  dominant_event_families?: EventFamily[];
  singleton_candidates?: SingletonCandidate[];
  overcluster_risks?: OverclusterRisk[];
  coverage_summary?: CoverageSummary;
};

type ApiResult = {
  ok: boolean;
  error?: string;
  articles?: number;
  analysis?: PoolAnalysis;
};

function formatConfidence(value: number | undefined) {
  if (typeof value !== "number") return "unknown";
  return `${Math.round(value * 100)}%`;
}

function labelRecommendation(value: string | undefined) {
  const labels: Record<string, string> = {
    merge_as_macro_cluster: "建議合併成大型事件",
    keep_separate_but_track_topic: "分開保留，但建議追蹤 topic",
    create_topic: "建議建立 topic",
    review_manually: "建議人工檢查",
    create_cluster: "建議建立 cluster",
    wait_for_more_articles: "等待更多文章",
    ignore: "可忽略",
    split: "建議拆分",
    keep_as_macro: "可保留為 macro cluster",
  };

  if (!value) return "未分類";
  return labels[value] ?? value;
}

function AnalysisItem({
  title,
  badge,
  confidence,
  body,
  action,
  articleIds,
  tone = "slate",
}: {
  title: string;
  badge?: string;
  confidence?: number;
  body: string;
  action?: string;
  articleIds?: string[];
  tone?: "slate" | "violet" | "amber" | "red";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-600",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-600",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold text-slate-950">{title}</h4>

        {badge && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            {badge}
          </span>
        )}

        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
          {formatConfidence(confidence)}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>

      {action && (
        <p className="mt-2 text-xs font-medium text-slate-500">
          {labelRecommendation(action)}
        </p>
      )}

      {(articleIds ?? []).length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            Article IDs ({articleIds?.length ?? 0})
          </summary>
          <p className="mt-2 break-words text-xs leading-5 text-slate-400">
            {(articleIds ?? []).join(", ")}
          </p>
        </details>
      )}
    </div>
  );
}

export function AnalyzePoolAiButton() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingRebuild, setLoadingRebuild] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [rebuildMessage, setRebuildMessage] = useState("");

  async function analyzePool() {
    setOpen(true);
    setLoadingAnalysis(true);
    setResult(null);
    setRebuildMessage("");

    try {
      const response = await fetch("/api/clusters/analyze-pool", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as ApiResult;

      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "AI article pool analysis failed",
      });
    } finally {
      setLoadingAnalysis(false);
    }
  }

  async function rebuildClusters() {
    setLoadingRebuild(true);
    setRebuildMessage("正在重新建立 clusters...");

    try {
      const response = await fetch("/api/clusters/rebuild", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setRebuildMessage(data.error ?? "重建 clusters 失敗");
        return;
      }

      setRebuildMessage(
        `完成：讀取 ${data.articles} 篇 articles，重建 ${data.clusters} 個 clusters`
      );

      router.refresh();
    } catch (error) {
      setRebuildMessage(
        error instanceof Error ? error.message : "重建 clusters 失敗"
      );
    } finally {
      setLoadingRebuild(false);
    }
  }

  const analysis = result?.analysis;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            AI Diagnostics
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            Article Pool Analysis
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            用 Gemini 檢查文章池中主要事件家族、singleton candidates 與 overcluster 風險。
          </p>
        </div>

        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={analyzePool}
              disabled={loadingAnalysis || loadingRebuild}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loadingAnalysis ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {loadingAnalysis ? "Analyzing..." : "Analyze Pool with AI"}
            </button>

            <button
              onClick={rebuildClusters}
              disabled={loadingAnalysis || loadingRebuild}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {loadingRebuild ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Network className="h-4 w-4" />
              )}
              {loadingRebuild ? "Rebuilding..." : "重新 Clusters"}
            </button>
          </div>

          {rebuildMessage && (
            <p className="mt-3 text-sm text-slate-500">{rebuildMessage}</p>
          )}

          {result && !result.ok && (
            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              {result.error ?? "AI analysis failed"}
            </div>
          )}

          {analysis && (
            <div className="mt-5 space-y-6">
              {analysis.coverage_summary && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Coverage Summary
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {analysis.coverage_summary.main_observation}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {analysis.coverage_summary.why_clusters_may_be_unbalanced}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-violet-700">
                    Next: {analysis.coverage_summary.recommended_next_step}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Dominant Event Families
                </h3>

                <div className="mt-3 space-y-3">
                  {(analysis.dominant_event_families ?? []).length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Gemini 沒有找到明顯的主要事件家族。
                    </p>
                  )}

                  {(analysis.dominant_event_families ?? []).map(
                    (item, index) => (
                      <AnalysisItem
                        key={`${item.zh_title}-${index}`}
                        title={item.zh_title}
                        badge={item.event_scope}
                        confidence={item.confidence}
                        body={item.why_it_matters}
                        action={item.recommendation}
                        articleIds={item.article_ids}
                        tone="violet"
                      />
                    )
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Singleton Candidates
                </h3>

                <div className="mt-3 space-y-3">
                  {(analysis.singleton_candidates ?? []).length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Gemini 沒有找到明顯 singleton candidate。
                    </p>
                  )}

                  {(analysis.singleton_candidates ?? []).map((item, index) => (
                    <AnalysisItem
                      key={`${item.zh_title}-${index}`}
                      title={item.zh_title}
                      confidence={item.confidence}
                      body={item.reason}
                      action={item.suggested_action}
                      articleIds={item.article_ids}
                      tone="amber"
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Overcluster Risks
                </h3>

                <div className="mt-3 space-y-3">
                  {(analysis.overcluster_risks ?? []).length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Gemini 沒有找到明顯 overcluster risk。
                    </p>
                  )}

                  {(analysis.overcluster_risks ?? []).map((item, index) => (
                    <AnalysisItem
                      key={`${item.zh_title}-${index}`}
                      title={item.zh_title}
                      confidence={item.confidence}
                      body={item.reason}
                      action={item.suggested_action}
                      articleIds={item.article_ids}
                      tone="red"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}