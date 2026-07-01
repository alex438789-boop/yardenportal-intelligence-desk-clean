import { GoogleGenAI } from "@google/genai";
import { createSupabaseServerClient } from "@/lib/supabase";

export const maxDuration = 180;

const GEMINI_BATCH_MODEL = "gemini-2.5-flash-lite";
const GEMINI_MERGE_MODEL = "gemini-2.5-flash-lite";
const MAX_ARTICLES = 90;
const BATCH_SIZE = 90;
const GEMINI_TIMEOUT_MS = 70000;

type Article = {
  id: string;
  title: string;
  source: string;
  published_at: string | null;
  summary: string | null;
  score: number | string | null;
  region: string | null;
  category: string | null;
};

type GeminiAnalysis = {
  dominant_event_families?: Array<{
    zh_title: string;
    event_scope: string;
    region: string;
    category: string;
    article_ids: string[];
    why_it_matters: string;
    recommendation: string;
    confidence: number;
  }>;
  singleton_candidates?: Array<{
    zh_title: string;
    article_ids: string[];
    reason: string;
    suggested_action: string;
    confidence: number;
  }>;
  overcluster_risks?: Array<{
    zh_title: string;
    article_ids: string[];
    reason: string;
    suggested_action: string;
    confidence: number;
  }>;
  coverage_summary?: {
    main_observation: string;
    why_clusters_may_be_unbalanced: string;
    recommended_next_step: string;
  };
};

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return "";

  const clean = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function safeParseGeminiJson(value: string) {
  const cleaned = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as GeminiAnalysis;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]) as GeminiAnalysis;
    } catch {
      return null;
    }
  }
}

function sanitizeGeminiAnalysis(parsed: GeminiAnalysis, articles: Article[]) {
  const validArticleIds = new Set(articles.map((article) => article.id));
  const articleNumberToId = new Map<string, string>();

  articles.forEach((article, index) => {
    const articleNumber = String(index + 1);

    articleNumberToId.set(articleNumber, article.id);
    articleNumberToId.set(`Article ${articleNumber}`, article.id);
    articleNumberToId.set(`article ${articleNumber}`, article.id);
  });

  function normalizeArticleId(value: unknown) {
    if (typeof value === "number") {
      return articleNumberToId.get(String(value)) ?? null;
    }

    if (typeof value !== "string") return null;

    const clean = value.trim();

    if (isUuid(clean) && validArticleIds.has(clean)) {
      return clean;
    }

    if (articleNumberToId.has(clean)) {
      return articleNumberToId.get(clean) ?? null;
    }

    const articleNumberMatch = clean.match(/^article\s+(\d+)$/i);

    if (articleNumberMatch) {
      return articleNumberToId.get(articleNumberMatch[1]) ?? null;
    }

    const pureNumberMatch = clean.match(/^\d+$/);

    if (pureNumberMatch) {
      return articleNumberToId.get(clean) ?? null;
    }

    return null;
  }

  function cleanArticleIds(value: unknown) {
    if (!Array.isArray(value)) return [];

    return Array.from(
      new Set(
        value
          .map((item) => normalizeArticleId(item))
          .filter((item): item is string => Boolean(item))
      )
    );
  }

  return {
    ...parsed,
    dominant_event_families: (parsed.dominant_event_families ?? []).map(
      (item) => ({
        ...item,
        article_ids: cleanArticleIds(item.article_ids),
      })
    ),
    singleton_candidates: (parsed.singleton_candidates ?? []).map((item) => ({
      ...item,
      article_ids: cleanArticleIds(item.article_ids),
    })),
    overcluster_risks: (parsed.overcluster_risks ?? []).map((item) => ({
      ...item,
      article_ids: cleanArticleIds(item.article_ids),
    })),
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function makeArticleText(articles: Article[], startIndex: number) {
  return articles
    .map((article, index) => {
      const articleNumber = startIndex + index + 1;

      return [
        `Article ${articleNumber}`,
        `UUID: ${article.id}`,
        `Title: ${truncateText(article.title, 160)}`,
        `Source: ${article.source}`,
        `Region: ${article.region ?? "unknown"}`,
        `Category: ${article.category ?? "unknown"}`,
        `Score: ${article.score ?? "unknown"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function makeBatchPrompt({
  articles,
  batchIndex,
  totalBatches,
  startIndex,
}: {
  articles: Article[];
  batchIndex: number;
  totalBatches: number;
  startIndex: number;
}) {
  const articleText = makeArticleText(articles, startIndex);

  return `
你是 YardenPORTAL Intelligence Desk 的國際政治與政策風險分析助手。
這是 article pool 快速 diagnostics 的第 ${batchIndex + 1} 批，共 ${totalBatches} 批。
請只根據本批文章，找出最值得建立 cluster 的事件家族。

任務目標：
- 這不是完整報告。
- 這是快速分群診斷。
- 少量高信心結果比大量模糊結果更好。
- 優先找出可以用 article_ids 建立 cluster 的事件群。

重要限制：
1. 只能根據提供的文章資料分析，不要新增外部事實。
2. 使用繁體中文。
3. 不要改寫文章，不要編造不存在的 article id。
4. article_ids 優先使用提供的 UUID。如果你只能判斷 Article 編號，也可以使用 Article 1、Article 2 這種格式，系統會自動轉換成 UUID。
5. 如果文章只是同一議題但不是同一事件，請標成 topic_series，不要標成 same_event。
6. 如果是大型連續衝突，例如以伊衝突、俄烏戰爭、南海對峙，可以標成 macro_event。
7. 請保守判斷，confidence 不足時低於 0.7。
8. 只回傳 JSON，不要 markdown，不要解釋。
9. dominant_event_families 最多 3 個。
10. singleton_candidates 最多 2 個。
11. overcluster_risks 最多 1 個。
12. 每個項目的 article_ids 最多列 6 個。
13. dominant_event_families 每個項目盡量至少包含 2 個 article_ids。
14. 如果某個判斷只是概念性觀察、長期議題或 topic idea，但沒有至少 2 個明確 article_ids，請放進 singleton_candidates 或 coverage_summary，不要放進 dominant_event_families。
15. 每個文字欄位請保持精簡，不要超過 70 個中文字。
16. 不要重複文章標題。
17. 不要輸出推理過程。

請回傳格式：

{
  "dominant_event_families": [
    {
      "zh_title": "繁體中文事件家族名稱",
      "event_scope": "same_event | macro_event | topic_series",
      "region": "區域",
      "category": "類別",
      "article_ids": ["article uuid 或 Article 編號"],
      "why_it_matters": "為什麼值得追蹤，70字內",
      "recommendation": "merge_as_macro_cluster | keep_separate_but_track_topic | create_topic | review_manually",
      "confidence": 0.0
    }
  ],
  "singleton_candidates": [
    {
      "zh_title": "可能被漏掉的事件或議題",
      "article_ids": ["article uuid 或 Article 編號"],
      "reason": "為什麼可能沒有出現在 clusters 頁",
      "suggested_action": "create_cluster | create_topic | wait_for_more_articles | ignore",
      "confidence": 0.0
    }
  ],
  "overcluster_risks": [
    {
      "zh_title": "可能被錯誤合併的事件",
      "article_ids": ["article uuid 或 Article 編號"],
      "reason": "為什麼可能混雜",
      "suggested_action": "split | keep_as_macro | review_manually",
      "confidence": 0.0
    }
  ],
  "coverage_summary": {
    "main_observation": "本批整體觀察，70字內",
    "why_clusters_may_be_unbalanced": "本批可能造成 clusters 失衡的原因，70字內",
    "recommended_next_step": "下一步建議，50字內"
  }
}

Articles:
${articleText}
`.trim();
}

function compactAnalysisForMerge(analysis: GeminiAnalysis) {
  return {
    dominant_event_families: (analysis.dominant_event_families ?? []).map(
      (item) => ({
        zh_title: item.zh_title,
        event_scope: item.event_scope,
        region: item.region,
        category: item.category,
        article_ids: item.article_ids,
        recommendation: item.recommendation,
        confidence: item.confidence,
      })
    ),
    singleton_candidates: (analysis.singleton_candidates ?? []).map((item) => ({
      zh_title: item.zh_title,
      article_ids: item.article_ids,
      suggested_action: item.suggested_action,
      confidence: item.confidence,
    })),
    overcluster_risks: (analysis.overcluster_risks ?? []).map((item) => ({
      zh_title: item.zh_title,
      article_ids: item.article_ids,
      suggested_action: item.suggested_action,
      confidence: item.confidence,
    })),
  };
}

function makeFinalMergePrompt({
  analyses,
  totalArticles,
  totalBatches,
}: {
  analyses: GeminiAnalysis[];
  totalArticles: number;
  totalBatches: number;
}) {
  const partialText = analyses
    .map((analysis, index) => {
      return [
        `Batch ${index + 1}`,
        JSON.stringify(compactAnalysisForMerge(analysis), null, 2),
      ].join("\n");
    })
    .join("\n\n");

  return `
你是 YardenPORTAL Intelligence Desk 的國際政治與政策風險分析助手。
下列是同一個文章池分批分析後的 compact partial analyses。
請將它們合併成一份 final analysis，避免重複，並保留最有用、最能建立 clusters 的事件家族。

重要背景：
- 總文章數：${totalArticles}
- 總批次數：${totalBatches}

合併規則：
1. 只能根據 partial analyses 內容，不要新增外部事實。
2. 使用繁體中文。
3. 合併相似的 event family，例如同一個以伊衝突、中東緊張、美中科技競爭，不要重複列。
4. article_ids 必須原樣保留並合併去重。
5. dominant_event_families 最多 5 個。
6. singleton_candidates 最多 4 個。
7. overcluster_risks 最多 2 個。
8. 每個 dominant_event_family 如果有 2 個以上 article_ids，優先保留。
9. 沒有足夠 article_ids 但有分析價值的項目，可以保留在 singleton_candidates。
10. 每個項目的 article_ids 最多列 8 個。
11. 每個文字欄位請保持精簡，不要超過 80 個中文字。
12. 只回傳 JSON，不要 markdown，不要解釋。

請回傳格式：

{
  "dominant_event_families": [
    {
      "zh_title": "繁體中文事件家族名稱",
      "event_scope": "same_event | macro_event | topic_series",
      "region": "區域",
      "category": "類別",
      "article_ids": ["article uuid 或 Article 編號"],
      "why_it_matters": "為什麼值得追蹤，80字內",
      "recommendation": "merge_as_macro_cluster | keep_separate_but_track_topic | create_topic | review_manually",
      "confidence": 0.0
    }
  ],
  "singleton_candidates": [
    {
      "zh_title": "可能被漏掉的事件或議題",
      "article_ids": ["article uuid 或 Article 編號"],
      "reason": "為什麼可能沒有出現在 clusters 頁",
      "suggested_action": "create_cluster | create_topic | wait_for_more_articles | ignore",
      "confidence": 0.0
    }
  ],
  "overcluster_risks": [
    {
      "zh_title": "可能被錯誤合併的事件",
      "article_ids": ["article uuid 或 Article 編號"],
      "reason": "為什麼可能混雜",
      "suggested_action": "split | keep_as_macro | review_manually",
      "confidence": 0.0
    }
  ],
  "coverage_summary": {
    "main_observation": "整體觀察，80字內",
    "why_clusters_may_be_unbalanced": "為什麼 clusters 頁可能失衡，80字內",
    "recommended_next_step": "下一步建議，60字內"
  }
}

Partial analyses:
${partialText}
`.trim();
}

function mergePartialAnalysesFallback(analyses: GeminiAnalysis[]): GeminiAnalysis {
  const dominantMap = new Map<
    string,
    NonNullable<GeminiAnalysis["dominant_event_families"]>[number]
  >();

  const singletonMap = new Map<
    string,
    NonNullable<GeminiAnalysis["singleton_candidates"]>[number]
  >();

  const overclusterMap = new Map<
    string,
    NonNullable<GeminiAnalysis["overcluster_risks"]>[number]
  >();

  for (const analysis of analyses) {
    for (const item of analysis.dominant_event_families ?? []) {
      const key = `${item.zh_title}-${item.event_scope}-${item.region}-${item.category}`;
      const existing = dominantMap.get(key);

      if (!existing) {
        dominantMap.set(key, {
          ...item,
          article_ids: uniqueStrings(item.article_ids ?? []),
        });
        continue;
      }

      dominantMap.set(key, {
        ...existing,
        article_ids: uniqueStrings([
          ...(existing.article_ids ?? []),
          ...(item.article_ids ?? []),
        ]),
        confidence: Math.max(existing.confidence ?? 0, item.confidence ?? 0),
      });
    }

    for (const item of analysis.singleton_candidates ?? []) {
      const key = `${item.zh_title}-${item.suggested_action}`;
      const existing = singletonMap.get(key);

      if (!existing) {
        singletonMap.set(key, {
          ...item,
          article_ids: uniqueStrings(item.article_ids ?? []),
        });
        continue;
      }

      singletonMap.set(key, {
        ...existing,
        article_ids: uniqueStrings([
          ...(existing.article_ids ?? []),
          ...(item.article_ids ?? []),
        ]),
        confidence: Math.max(existing.confidence ?? 0, item.confidence ?? 0),
      });
    }

    for (const item of analysis.overcluster_risks ?? []) {
      const key = `${item.zh_title}-${item.suggested_action}`;
      const existing = overclusterMap.get(key);

      if (!existing) {
        overclusterMap.set(key, {
          ...item,
          article_ids: uniqueStrings(item.article_ids ?? []),
        });
        continue;
      }

      overclusterMap.set(key, {
        ...existing,
        article_ids: uniqueStrings([
          ...(existing.article_ids ?? []),
          ...(item.article_ids ?? []),
        ]),
        confidence: Math.max(existing.confidence ?? 0, item.confidence ?? 0),
      });
    }
  }

  const dominant_event_families = Array.from(dominantMap.values())
    .filter((item) => (item.article_ids?.length ?? 0) >= 2)
    .sort((a, b) => {
      const articleDiff =
        (b.article_ids?.length ?? 0) - (a.article_ids?.length ?? 0);

      if (articleDiff !== 0) return articleDiff;

      return (b.confidence ?? 0) - (a.confidence ?? 0);
    })
    .slice(0, 5);

  const singleton_candidates = Array.from(singletonMap.values())
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 4);

  const overcluster_risks = Array.from(overclusterMap.values())
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 2);

  return {
    dominant_event_families,
    singleton_candidates,
    overcluster_risks,
    coverage_summary: {
      main_observation:
        "Gemini final merge 未完成，系統已用程式快速合併批次結果。",
      why_clusters_may_be_unbalanced:
        "此 fallback 版本優先穩定性，可能保留少量相似但未語意合併的事件家族。",
      recommended_next_step:
        "先勾選 article IDs 足夠的事件家族建立 clusters，再人工刪除重複項目。",
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  return String(error);
}

function isRetryableGeminiError(error: unknown) {
  const message = getGeminiErrorMessage(error);

  return (
    message.includes("503") ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand") ||
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED")
  );
}

async function generateGeminiJson({
  ai,
  prompt,
  model,
}: {
  ai: GoogleGenAI;
  prompt: string;
  model: string;
}) {
  const fallbackModels = Array.from(
    new Set([model, "gemini-2.5-flash", "gemini-2.0-flash-lite"])
  );

  let lastError: unknown = null;

  for (const currentModel of fallbackModels) {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const responsePromise = ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Gemini timed out on ${currentModel}`));
          }, GEMINI_TIMEOUT_MS);
        });

        const response = await Promise.race([responsePromise, timeoutPromise]);
        const text = response.text ?? "";
        const parsed = safeParseGeminiJson(text);

        if (!parsed) {
          throw new Error(`Gemini returned invalid JSON on ${currentModel}`);
        }

        return parsed;
      } catch (error) {
        lastError = error;

        if (!isRetryableGeminiError(error)) {
          throw error;
        }

        if (attempt < maxAttempts) {
          await sleep(1500 * attempt);
        }
      }
    }
  }

  throw new Error(
    `Gemini unavailable after fallback models: ${getGeminiErrorMessage(
      lastError
    )}`
  );
}

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: Record<string, unknown>
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 15000);

      try {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
          sendEvent(controller, encoder, {
            type: "error",
            message: "Missing GEMINI_API_KEY",
          });
          controller.close();
          return;
        }

        sendEvent(controller, encoder, {
          type: "progress",
          message: "正在讀取文章池...",
          stage: "reading_articles",
        });

        const supabase = createSupabaseServerClient();

        const { data: articles, error } = await supabase
          .from("articles")
          .select("id,title,source,published_at,summary,score,region,category")
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(MAX_ARTICLES);

        if (error) {
          sendEvent(controller, encoder, {
            type: "error",
            message: error.message,
          });
          controller.close();
          return;
        }

        const typedArticles = (articles ?? []) as Article[];

        if (typedArticles.length === 0) {
          sendEvent(controller, encoder, {
            type: "complete",
            result: {
              ok: true,
              method: "Gemini Lite article pool diagnostics stream",
              merge_method: "none_empty_pool",
              articles: 0,
              batches: 0,
              batch_size: BATCH_SIZE,
              model: GEMINI_BATCH_MODEL,
              merge_model: GEMINI_MERGE_MODEL,
              analysis: {
                dominant_event_families: [],
                singleton_candidates: [],
                overcluster_risks: [],
                coverage_summary: {
                  main_observation: "目前文章池沒有可分析的文章。",
                  why_clusters_may_be_unbalanced:
                    "文章池為空，因此無法判斷 clusters 是否失衡。",
                  recommended_next_step: "請先執行 Refresh Articles。",
                },
              },
            },
          });
          controller.close();
          return;
        }

        const ai = new GoogleGenAI({ apiKey });
        const articleBatches = chunkArray(typedArticles, BATCH_SIZE);
        const partialAnalyses: GeminiAnalysis[] = [];

        sendEvent(controller, encoder, {
          type: "progress",
          message: `共讀取 ${typedArticles.length} 篇文章，分成 ${articleBatches.length} 批分析。`,
          stage: "articles_loaded",
          total_articles: typedArticles.length,
          total_batches: articleBatches.length,
        });

        for (let index = 0; index < articleBatches.length; index += 1) {
          const batch = articleBatches[index];
          const startIndex = index * BATCH_SIZE;

          sendEvent(controller, encoder, {
            type: "progress",
            message: `正在分析第 ${index + 1} 批 / 共 ${
              articleBatches.length
            } 批...`,
            stage: "batch_running",
            current_batch: index + 1,
            total_batches: articleBatches.length,
          });

          const prompt = makeBatchPrompt({
            articles: batch,
            batchIndex: index,
            totalBatches: articleBatches.length,
            startIndex,
          });

          const parsed = await generateGeminiJson({
            ai,
            prompt,
            model: GEMINI_BATCH_MODEL,
          });

          const sanitized = sanitizeGeminiAnalysis(parsed, typedArticles);

          partialAnalyses.push(sanitized);

          sendEvent(controller, encoder, {
            type: "progress",
            message: `第 ${index + 1} 批完成。`,
            stage: "batch_complete",
            current_batch: index + 1,
            total_batches: articleBatches.length,
          });
        }

        sendEvent(controller, encoder, {
          type: "progress",
          message: "正在用 Gemini Lite 統合所有批次結果...",
          stage: "gemini_final_merge",
          total_batches: articleBatches.length,
        });

        let finalAnalysis: GeminiAnalysis;
        let mergeMethod = "gemini_final_merge";

        try {
          const finalPrompt = makeFinalMergePrompt({
            analyses: partialAnalyses,
            totalArticles: typedArticles.length,
            totalBatches: articleBatches.length,
          });

          const finalParsed = await generateGeminiJson({
            ai,
            prompt: finalPrompt,
            model: GEMINI_MERGE_MODEL,
          });

          finalAnalysis = sanitizeGeminiAnalysis(finalParsed, typedArticles);
        } catch {
          sendEvent(controller, encoder, {
            type: "progress",
            message: "Gemini final merge 失敗，改用程式快速合併批次結果...",
            stage: "programmatic_merge_fallback",
            total_batches: articleBatches.length,
          });

          finalAnalysis = sanitizeGeminiAnalysis(
            mergePartialAnalysesFallback(partialAnalyses),
            typedArticles
          );

          mergeMethod = "programmatic_partial_merge_fallback";
        }

        sendEvent(controller, encoder, {
          type: "complete",
          result: {
            ok: true,
            method: "Gemini Lite batch diagnostics with Gemini final merge",
            merge_method: mergeMethod,
            articles: typedArticles.length,
            batches: articleBatches.length,
            batch_size: BATCH_SIZE,
            model: GEMINI_BATCH_MODEL,
            merge_model: GEMINI_MERGE_MODEL,
            analysis: finalAnalysis,
          },
        });

        controller.close();
      } catch (error) {
        sendEvent(controller, encoder, {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to analyze article pool",
        });
        controller.close();
      } finally {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}