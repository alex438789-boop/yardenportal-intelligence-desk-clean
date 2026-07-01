"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Brain, CheckSquare, ChevronDown, Loader2, Square } from "lucide-react";

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

function makeFamilyKey(item: EventFamily, index: number) {
  return `${item.zh_title}-${index}`;
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

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}
        >
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
  const [loadingApply, setLoadingApply] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [selectedFamilyKeys, setSelectedFamilyKeys] = useState<string[]>([]);
  const [applyMessage, setApplyMessage] = useState("");
  const [progressMessage, setProgressMessage] = useState("");

  const analysis = result?.analysis;
  const dominantFamilies = analysis?.dominant_event_families ?? [];

  const clusterableFamilies = dominantFamilies.filter(
    (item) => (item.article_ids ?? []).length >= 2
  );

  const analysisOnlyFamilies = dominantFamilies.filter(
    (item) => (item.article_ids ?? []).length < 2
  );

  const selectedFamilies = useMemo(() => {
    return clusterableFamilies.filter((item, index) =>
      selectedFamilyKeys.includes(makeFamilyKey(item, index))
    );
  }, [clusterableFamilies, selectedFamilyKeys]);

  function toggleFamily(item: EventFamily, index: number) {
    const key = makeFamilyKey(item, index);

    setSelectedFamilyKeys((current) => {
      if (current.includes(key)) {
        return current.filter((value) => value !== key);
      }

      return [...current, key];
    });
  }

  function analyzePool() {
  setOpen(true);
  setLoadingAnalysis(true);
  setResult(null);
  setSelectedFamilyKeys([]);
  setApplyMessage("");
  setProgressMessage("正在啟動 AI diagnostics stream...");

  const eventSource = new EventSource("/api/clusters/analyze-pool/stream");

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        type: "progress" | "complete" | "error";
        message?: string;
        result?: ApiResult;
      };

      if (payload.type === "progress") {
        setProgressMessage(payload.message ?? "AI diagnostics 進行中...");
      }

      if (payload.type === "complete") {
        setResult(payload.result ?? null);
        setProgressMessage("完成：AI diagnostics 已產生。");
        setLoadingAnalysis(false);
        eventSource.close();
      }

      if (payload.type === "error") {
        setResult({
          ok: false,
          error: payload.message ?? "AI diagnostics failed",
        });
        setProgressMessage("AI diagnostics 失敗。");
        setLoadingAnalysis(false);
        eventSource.close();
      }
    } catch {
      setResult({
        ok: false,
        error: "Failed to parse AI diagnostics stream event",
      });
      setProgressMessage("AI diagnostics stream 解析失敗。");
      setLoadingAnalysis(false);
      eventSource.close();
    }
  };

  eventSource.onerror = () => {
    setResult({
      ok: false,
      error: "AI diagnostics stream interrupted",
    });
    setProgressMessage("AI diagnostics stream 中斷。");
    setLoadingAnalysis(false);
    eventSource.close();
  };
}

  async function applySelectedFamilies() {
    if (selectedFamilies.length === 0) {
      setApplyMessage("請先勾選至少一個可建立 cluster 的 event family。");
      return;
    }

    setLoadingApply(true);
    setApplyMessage("正在依照 AI 建議建立 clusters...");

    try {
      const response = await fetch("/api/clusters/apply-ai-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          families: selectedFamilies,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setApplyMessage(data.error ?? "套用 AI 建議失敗");
        return;
      }

      setApplyMessage(
        `完成：建立 ${data.created_clusters} 個 AI-assisted clusters。`
      );

      router.refresh();
    } catch (error) {
      setApplyMessage(
        error instanceof Error ? error.message : "套用 AI 建議失敗"
      );
    } finally {
      setLoadingApply(false);
    }
  }

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
            用 Gemini 檢查新聞池中主要事件群組，勾選後可依照 article IDs 建立
            AI-assisted clusters。
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
              disabled={loadingAnalysis || loadingApply}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loadingAnalysis ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {loadingAnalysis ? progressMessage || "Analyzing..." : "Analyze Pool with AI"}
            </button>

            {clusterableFamilies.length > 0 && (
              <button
                onClick={applySelectedFamilies}
                disabled={loadingAnalysis || loadingApply}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {loadingApply ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckSquare className="h-4 w-4" />
                )}
                {loadingApply
                  ? "Applying..."
                  : `Apply Selected (${selectedFamilies.length})`}
              </button>
            )}
          </div>

          {applyMessage && (
            <p className="mt-3 text-sm text-slate-500">{applyMessage}</p>
          )}

          {loadingAnalysis && progressMessage && (
            <p className="mt-3 text-sm font-medium text-violet-600">
              {progressMessage}
            </p>
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
                  Dominant Event Families 可建立 Clusters
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  這裡只顯示至少有 2 個有效 article_ids 的 Gemini 建議。勾選後按
                  Apply Selected，系統會依照這些 article_ids 建立新的
                  AI-assisted cluster。
                </p>

                <div className="mt-3 space-y-3">
                  {clusterableFamilies.length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      目前沒有可直接建立 cluster 的 dominant event family。這代表
                      Gemini 的觀察可能偏向 topic idea，或沒有提供足夠 article IDs。
                    </p>
                  )}

                  {clusterableFamilies.map((item, index) => {
                    const key = makeFamilyKey(item, index);
                    const selected = selectedFamilyKeys.includes(key);

                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-4 transition ${
                          selected
                            ? "border-violet-300 bg-violet-50/40"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex gap-3">
                          <button
                            onClick={() => toggleFamily(item, index)}
                            className="mt-1 text-violet-600"
                            aria-label="Select dominant event family"
                          >
                            {selected ? (
                              <CheckSquare className="h-5 w-5" />
                            ) : (
                              <Square className="h-5 w-5" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-slate-950">
                                {item.zh_title}
                              </h4>

                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                                {item.event_scope}
                              </span>

                              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                                {formatConfidence(item.confidence)}
                              </span>

                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                {item.article_ids?.length ?? 0} articles
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
                        </div>
                      </div>
                    );
                  })}
                </div>

                {analysisOnlyFamilies.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Analysis-only Suggestions 分析參考
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      這些是 Gemini 提出的事件方向或 topic idea，但沒有至少 2
                      個有效 article_ids，因此不會建立 cluster。
                    </p>

                    <div className="mt-3 space-y-3">
                      {analysisOnlyFamilies.map((item, index) => (
                        <div
                          key={`${item.zh_title}-analysis-only-${index}`}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-950">
                              {item.zh_title}
                            </h4>

                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                              {item.event_scope}
                            </span>

                            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                              {formatConfidence(item.confidence)}
                            </span>

                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                              analysis only
                            </span>
                          </div>

                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {item.why_it_matters}
                          </p>

                          <p className="mt-2 text-xs text-slate-500">
                            {item.region} · {item.category} ·{" "}
                            {labelRecommendation(item.recommendation)}
                          </p>

                          <p className="mt-2 text-xs text-slate-400">
                            沒有足夠 article IDs，建議之後作為 Topic 或 rules
                            調整參考。
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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