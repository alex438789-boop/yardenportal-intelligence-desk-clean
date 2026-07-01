"use client";

import { useState } from "react";
import { Brain, Loader2 } from "lucide-react";

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

export function AnalyzePoolAiButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function analyzePool() {
    setLoading(true);
    setResult(null);

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
      setLoading(false);
    }
  }

  const analysis = result?.analysis;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            AI Diagnostics
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            Analyze Article Pool with AI
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            讓 Gemini 檢查最近文章池中有哪些主要事件家族、哪些 singleton 可能被漏掉，以及 clusters 為什麼可能失衡。這個功能只做診斷，不會修改資料庫。
          </p>
        </div>

        <button
          onClick={analyzePool}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {loading ? "Analyzing..." : "Analyze Pool with AI"}
        </button>
      </div>

      {result && !result.ok && (
        <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          {result.error ?? "AI analysis failed"}
        </div>
      )}

      {analysis && (
        <div className="mt-5 space-y-5">
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

              {(analysis.dominant_event_families ?? []).map((item, index) => (
                <div
                  key={`${item.zh_title}-${index}`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-950">
                      {item.zh_title}
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      {item.event_scope}
                    </span>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600">
                      {formatConfidence(item.confidence)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.why_it_matters}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {item.region} · {item.category} ·{" "}
                    {labelRecommendation(item.recommendation)}
                  </p>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-400">
                      Article IDs ({item.article_ids?.length ?? 0})
                    </summary>
                    <p className="mt-2 break-words text-xs leading-5 text-slate-400">
                      {(item.article_ids ?? []).join(", ")}
                    </p>
                  </details>
                </div>
              ))}
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
                <div
                  key={`${item.zh_title}-${index}`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-950">
                      {item.zh_title}
                    </h4>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      {formatConfidence(item.confidence)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.reason}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {labelRecommendation(item.suggested_action)}
                  </p>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-400">
                      Article IDs ({item.article_ids?.length ?? 0})
                    </summary>
                    <p className="mt-2 break-words text-xs leading-5 text-slate-400">
                      {(item.article_ids ?? []).join(", ")}
                    </p>
                  </details>
                </div>
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
                <div
                  key={`${item.zh_title}-${index}`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-950">
                      {item.zh_title}
                    </h4>
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                      {formatConfidence(item.confidence)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.reason}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    {labelRecommendation(item.suggested_action)}
                  </p>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-400">
                      Article IDs ({item.article_ids?.length ?? 0})
                    </summary>
                    <p className="mt-2 break-words text-xs leading-5 text-slate-400">
                      {(item.article_ids ?? []).join(", ")}
                    </p>
                  </details>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}