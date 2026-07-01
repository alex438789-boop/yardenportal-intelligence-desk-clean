import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_ARTICLES = 120;
const MAX_SUMMARY_CHARS = 220;
const GEMINI_TIMEOUT_MS = 45000;

type Article = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  score: number | string | null;
  region: string | null;
  category: string | null;
  topic_tags: string[] | null;
  matched_rules: string[] | null;
  event_keywords: string[] | null;
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

function safeParseGeminiJson(value: string) {
  const cleaned = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function makePrompt(articles: Article[]) {
  const articleText = articles
    .map((article, index) => {
      return [
        `Article ${index + 1}`,
        `ID: ${article.id}`,
        `Title: ${article.title}`,
        `Source: ${article.source}`,
        `Published at: ${article.published_at ?? "unknown"}`,
        `Region: ${article.region ?? "unknown"}`,
        `Category: ${article.category ?? "unknown"}`,
        `Score: ${article.score ?? "unknown"}`,
        `Topic tags: ${(article.topic_tags ?? []).join(", ") || "none"}`,
        `Matched rules: ${(article.matched_rules ?? []).join(", ") || "none"}`,
        `Event keywords: ${(article.event_keywords ?? []).join(", ") || "none"}`,
        `Summary: ${truncateText(article.summary, MAX_SUMMARY_CHARS)}`,
      ].join("\n");
    })
    .join("\n\n");

  return `
你是 YardenPORTAL Intelligence Desk 的國際政治與政策風險分析助手。
請分析下列文章池，找出目前主要事件家族、被拆太散的事件、以及可能沒有出現在 clusters 頁的 singleton candidates。

重要限制：
1. 只能根據提供的文章資料分析，不要新增外部事實。
2. 使用繁體中文。
3. 不要改寫文章，不要編造不存在的 article id。
4. article_ids 必須只使用提供的 ID。
5. 如果文章只是同一議題但不是同一事件，請標成 topic_series，不要標成 same_event。
6. 如果是大型連續衝突，例如以伊衝突、俄烏戰爭、南海對峙，可以標成 macro_event。
7. 如果某個主題文章很多但可能被拆成 singleton，請放進 singleton_candidates。
8. 請保守判斷，confidence 不足時低於 0.7。
9. 只回傳 JSON，不要 markdown，不要解釋。
10. dominant_event_families 最多 6 個。
11. singleton_candidates 最多 6 個。
12. overcluster_risks 最多 4 個。

請回傳格式：

{
  "dominant_event_families": [
    {
      "zh_title": "繁體中文事件家族名稱",
      "event_scope": "same_event | macro_event | topic_series",
      "region": "區域",
      "category": "類別",
      "article_ids": ["article id"],
      "why_it_matters": "為什麼值得追蹤，80字內",
      "recommendation": "merge_as_macro_cluster | keep_separate_but_track_topic | create_topic | review_manually",
      "confidence": 0.0
    }
  ],
  "singleton_candidates": [
    {
      "zh_title": "可能被漏掉的事件或議題",
      "article_ids": ["article id"],
      "reason": "為什麼可能沒有出現在 clusters 頁",
      "suggested_action": "create_cluster | create_topic | wait_for_more_articles | ignore",
      "confidence": 0.0
    }
  ],
  "overcluster_risks": [
    {
      "zh_title": "可能被錯誤合併的事件",
      "article_ids": ["article id"],
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

Articles:
${articleText}
`.trim();
}

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing GEMINI_API_KEY" },
      { status: 500 }
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: articles, error } = await supabase
    .from("articles")
    .select(
      "id,title,source,url,published_at,summary,score,region,category,topic_tags,matched_rules,event_keywords"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ARTICLES);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const typedArticles = (articles ?? []) as Article[];

  if (typedArticles.length === 0) {
    return NextResponse.json({
      ok: true,
      articles: 0,
      analysis: {
        dominant_event_families: [],
        singleton_candidates: [],
        overcluster_risks: [],
        coverage_summary: {
          main_observation: "目前文章池沒有可分析的文章。",
          why_clusters_may_be_unbalanced: "文章池為空，因此無法判斷 clusters 是否失衡。",
          recommended_next_step: "請先執行 Refresh Articles。",
        },
      },
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = makePrompt(typedArticles);

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
      return NextResponse.json(
        { ok: false, error: "Gemini returned invalid JSON" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      method: "Gemini article pool diagnostics",
      articles: typedArticles.length,
      analysis: parsed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze article pool",
      },
      { status: 500 }
    );
  }
}