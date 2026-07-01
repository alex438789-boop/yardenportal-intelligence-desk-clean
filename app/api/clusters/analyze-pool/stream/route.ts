import { GoogleGenAI } from "@google/genai";
import { createSupabaseServerClient } from "@/lib/supabase";

export const maxDuration = 120;

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_ARTICLES = 120;
const BATCH_SIZE = 60;
const MAX_SUMMARY_CHARS = 120;
const GEMINI_TIMEOUT_MS = 60000;

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
        `Published at: ${article.published_at ?? "unknown"}`,
        `Region: ${article.region ?? "unknown"}`,
        `Category: ${article.category ?? "unknown"}`,
        `Score: ${article.score ?? "unknown"}`,
        `Summary: ${truncateText(article.summary, MAX_SUMMARY_CHARS)}`,
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
這是文章池分批分析的第 ${batchIndex + 1} 批，共 ${totalBatches} 批。
請只根據本批文章，找出主要事件家族、可能被拆太散的 singleton candidates，以及可能 overcluster 的風險。

重要限制：
1. 只能根據提供的文章資料分析，不要新增外部事實。
2. 使用繁體中文。
3. 不要改寫文章，不要編造不存在的 article id。
4. article_ids 優先使用提供的 UUID。如果你只能判斷 Article 編號，也可以使用 Article 1、Article 2 這種格式，系統會自動轉換成 UUID。
5. 如果文章只是同一議題但不是同一事件，請標成 topic_series，不要標成 same_event。
6. 如果是大型連續衝突，例如以伊衝突、俄烏戰爭、南海對峙，可以標成 macro_event。
7. 請保守判斷，confidence 不足時低於 0.7。
8. 只回傳 JSON，不要 markdown，不要解釋。
9. dominant_event_families 最多 4 個。
10. singleton_candidates 最多 4 個。
11. overcluster_risks 最多 2 個。
12. 每個項目的 article_ids 最多列 8 個。
13. dominant_event_families 每個項目盡量至少包含 2 個 article_ids。
14. 如果某個判斷只是概念性觀察、長期議題或 topic idea，但沒有至少 2 個明確 article_ids，請放進 singleton_candidates 或 coverage_summary，不要放進 dominant_event_families。

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
    "main_observation": "本批整體觀察，80字內",
    "why_clusters_may_be_unbalanced": "本批可能造成 clusters 失衡的原因，80字內",
    "recommended_next_step": "下一步建議，60字內"
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
下列是同一個文章池分批分析後的 partial analyses。
請將它們合併成一份 final analysis，避免重複，並保留最有用、最能建立 clusters 的事件家族。

重要背景：
- 總文章數：${totalArticles}
- 總批次數：${totalBatches}

合併規則：
1. 只能根據 partial analyses 內容，不要新增外部事實。
2. 使用繁體中文。
3. 合併相似的 event family，例如同一個以伊衝突、中東緊張、美中科技競爭，不要重複列。
4. article_ids 必須原樣保留並合併去重。
5. dominant_event_families 最多 8 個。
6. singleton_candidates 最多 8 個。
7. overcluster_risks 最多 4 個。
8. 每個 dominant_event_family 如果有 2 個以上 article_ids，優先保留。
9. 沒有足夠 article_ids 但有分析價值的項目，可以保留在 singleton_candidates。
10. 只回傳 JSON，不要 markdown，不要解釋。

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
    "main_observation": "整體觀察，120字內",
    "why_clusters_may_be_unbalanced": "為什麼 clusters 頁可能看起來偏向某區域或某事件，120字內",
    "recommended_next_step": "下一步建議，80字內"
  }
}

Partial analyses:
${partialText}
`.trim();
}

async function generateGeminiJson(ai: GoogleGenAI, prompt: string) {
  const responsePromise = ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Gemini pool analysis timed out"));
    }, GEMINI_TIMEOUT_MS);
  });

  const response = await Promise.race([responsePromise, timeoutPromise]);
  const text = response.text ?? "";
  const parsed = safeParseGeminiJson(text);

  if (!parsed) {
    throw new Error("Gemini returned invalid JSON");
  }

  return parsed;
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
              method: "Gemini batch article pool diagnostics stream",
              articles: 0,
              batches: 0,
              batch_size: BATCH_SIZE,
              model: GEMINI_MODEL,
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

          const parsed = await generateGeminiJson(ai, prompt);
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
          message: "正在統合所有批次的 Gemini 分析結果...",
          stage: "final_merge",
          total_batches: articleBatches.length,
        });

        const finalPrompt = makeFinalMergePrompt({
          analyses: partialAnalyses,
          totalArticles: typedArticles.length,
          totalBatches: articleBatches.length,
        });

        const finalParsed = await generateGeminiJson(ai, finalPrompt);
        const finalAnalysis = sanitizeGeminiAnalysis(
          finalParsed,
          typedArticles
        );

        sendEvent(controller, encoder, {
          type: "complete",
          result: {
            ok: true,
            method: "Gemini batch article pool diagnostics stream",
            articles: typedArticles.length,
            batches: articleBatches.length,
            batch_size: BATCH_SIZE,
            model: GEMINI_MODEL,
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