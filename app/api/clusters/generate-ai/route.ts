import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const MAX_ARTICLES_PER_CLUSTER = 8;
const GEMINI_TIMEOUT_MS = 45000;

type RelatedArticle = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  category: string | null;
  region: string | null;
};

type ClusterArticleRelation = {
  articles: RelatedArticle | RelatedArticle[] | null;
};

type ClusterRecord = {
  id: string;
  title: string;
  summary: string | null;
  region: string | null;
  category: string | null;
  article_count: number | null;
  source_count: number | null;
  cluster_articles: ClusterArticleRelation[] | null;
};

function unique(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

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

function getRelatedArticles(cluster: ClusterRecord): RelatedArticle[] {
  return (cluster.cluster_articles ?? [])
    .flatMap((relation) => {
      if (!relation.articles) return [];

      return Array.isArray(relation.articles)
        ? relation.articles
        : [relation.articles];
    })
    .filter(Boolean);
}

function safeParseGeminiJson(value: string) {
  const cleaned = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Partial<{
      title: string;
      summary: string;
    }>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]) as Partial<{
        title: string;
        summary: string;
      }>;
    } catch {
      return null;
    }
  }
}

function makePrompt(cluster: ClusterRecord, articles: RelatedArticle[]) {
  const sources = unique(articles.map((article) => article.source));

  const articleText = articles
    .slice(0, MAX_ARTICLES_PER_CLUSTER)
    .map((article, index) => {
      return [
        `Article ${index + 1}`,
        `Title: ${article.title}`,
        `Source: ${article.source}`,
        `Published at: ${article.published_at ?? "unknown"}`,
        `Category: ${article.category ?? "unknown"}`,
        `Region: ${article.region ?? "unknown"}`,
        `Summary: ${truncateText(article.summary, 700)}`,
      ].join("\n");
    })
    .join("\n\n");

  return `
你是 YardenPORTAL Intelligence Desk 的國際政治與政策風險分析助手。
請根據下列已經被系統分成同一 cluster 的新聞，生成一個繁體中文 title 和 summary。

嚴格規則：
1. 只能根據提供的新聞內容，不要新增外部事實。
2. 使用繁體中文。
3. title 不超過 28 個中文字。
4. title 必須指出「主要行為者 + 動作 / 爭議 / 風險」，不要只寫國名或地名。
5. summary 80 到 150 個中文字。
6. summary 要說清楚這組新聞在講什麼，以及為什麼值得追蹤。
7. 語氣保持保守、分析性，不要誇大，不要像社論。
8. 不要使用「這個事件群組」「這組新聞」作為 title。
9. 如果新聞其實只是同一區域但不是完全同一事件，請用保守標題，避免過度推論。
10. 只回傳 JSON，不要回傳 markdown，不要解釋。

回傳格式：
{
  "title": "繁體中文標題",
  "summary": "繁體中文摘要"
}

Cluster metadata:
- Current title: ${cluster.title}
- Current region: ${cluster.region ?? "unknown"}
- Current category: ${cluster.category ?? "unknown"}
- Article count: ${articles.length}
- Sources: ${sources.join("、")}

Articles:
${articleText}
`.trim();
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing GEMINI_API_KEY" },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    clusterId?: string;
  } | null;

  const clusterId = body?.clusterId;

  if (!clusterId) {
    return NextResponse.json(
      { ok: false, error: "Missing clusterId" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: cluster, error: clusterError } = await supabase
    .from("article_clusters")
    .select(
      `
      id,
      title,
      summary,
      region,
      category,
      article_count,
      source_count,
      cluster_articles (
        articles (
          id,
          title,
          source,
          url,
          published_at,
          summary,
          category,
          region
        )
      )
    `
    )
    .eq("id", clusterId)
    .single();

  if (clusterError || !cluster) {
    return NextResponse.json(
      { ok: false, error: clusterError?.message ?? "Cluster not found" },
      { status: 404 }
    );
  }

  const typedCluster = cluster as ClusterRecord;
  const articles = getRelatedArticles(typedCluster);

  if (articles.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No related articles found" },
      { status: 400 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = makePrompt(typedCluster, articles);

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
        reject(new Error("Gemini request timed out"));
      }, GEMINI_TIMEOUT_MS);
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const text = response.text ?? "";
    const parsed = safeParseGeminiJson(text);

    const title = truncateText(parsed?.title, 80);
    const summary = truncateText(parsed?.summary, 500);

    if (!title || !summary) {
      return NextResponse.json(
        { ok: false, error: "Gemini returned empty title or summary" },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("article_clusters")
      .update({
        title,
        summary,
        summary_source: "gemini",
      })
      .eq("id", clusterId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      cluster_id: clusterId,
      title,
      summary,
      summary_source: "gemini",
      articles: articles.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate Gemini summary",
      },
      { status: 500 }
    );
  }
}