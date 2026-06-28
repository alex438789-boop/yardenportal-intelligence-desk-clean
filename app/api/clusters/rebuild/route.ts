import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
};

type ClusterDraft = {
  title: string;
  summary: string;
  score: number;
  region: string | null;
  category: string | null;
  tags: string[];
  matched_rules: string[];
  articles: Article[];
};

const STOP_WORDS = new Set([
  "的",
  "了",
  "和",
  "與",
  "及",
  "在",
  "對",
  "為",
  "是",
  "有",
  "將",
  "中",
  "就",
  "被",
  "後",
  "前",
  "說",
  "稱",
  "表示",
  "指出",
  "新聞",
  "報導",
  "最新",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "has",
  "have",
  "will",
  "said",
  "says",
  "new",
  "news",
]);

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 5.5;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 5.5 : numberValue;
}

function unique(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function tokenize(text: string) {
  const normalized = text
    .replace(/[，。！？、；：「」『』（）()【】\[\],.!?:;"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const latinWords = normalized.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];
  const chineseChunks = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];

  const chineseTokens = chineseChunks.flatMap((chunk) => {
    const tokens: string[] = [];

    if (chunk.length <= 6) {
      tokens.push(chunk);
    }

    for (let size = 2; size <= 4; size += 1) {
      for (let i = 0; i <= chunk.length - size; i += 1) {
        tokens.push(chunk.slice(i, i + size));
      }
    }

    return tokens;
  });

  return unique([...latinWords, ...chineseTokens])
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token.toLowerCase()))
    .slice(0, 80);
}

function getArticleKeywords(article: Article) {
  const text = `${article.title} ${article.summary ?? ""}`;
  const tokens = tokenize(text);

  const tags = article.topic_tags ?? [];
  const rules = article.matched_rules ?? [];

  return unique([...tokens, ...tags, ...rules]);
}

function overlapCount(a: string[], b: string[]) {
  const setB = new Set(b.map((item) => item.toLowerCase()));
  return a.filter((item) => setB.has(item.toLowerCase())).length;
}

function articleSimilarity(article: Article, cluster: ClusterDraft) {
  const articleKeywords = getArticleKeywords(article);
  const clusterKeywords = unique(
    cluster.articles.flatMap((item) => getArticleKeywords(item))
  );

  const keywordOverlap = overlapCount(articleKeywords, clusterKeywords);
  const tagOverlap = overlapCount(article.topic_tags ?? [], cluster.tags);
  const ruleOverlap = overlapCount(
    article.matched_rules ?? [],
    cluster.matched_rules
  );

  let score = 0;

  if (article.region && cluster.region && article.region === cluster.region) {
    score += 1;
  }

  if (
    article.category &&
    cluster.category &&
    article.category === cluster.category
  ) {
    score += 1;
  }

  score += Math.min(keywordOverlap, 5);
  score += tagOverlap * 2;
  score += ruleOverlap * 2;

  return score;
}

function isWithinTimeWindow(article: Article, cluster: ClusterDraft) {
  const articleTime = article.published_at
    ? new Date(article.published_at).getTime()
    : null;

  const clusterTimes = cluster.articles
    .map((item) =>
      item.published_at ? new Date(item.published_at).getTime() : null
    )
    .filter((value): value is number => value !== null);

  if (!articleTime || clusterTimes.length === 0) return true;

  const latestClusterTime = Math.max(...clusterTimes);
  const diffHours = Math.abs(articleTime - latestClusterTime) / 1000 / 60 / 60;

  return diffHours <= 72;
}

function shouldJoinCluster(article: Article, cluster: ClusterDraft) {
  if (!isWithinTimeWindow(article, cluster)) return false;

  const similarity = articleSimilarity(article, cluster);

  return similarity >= 5;
}

function makeClusterTitle(articles: Article[]) {
  const sorted = [...articles].sort(
    (a, b) => toNumber(b.score) - toNumber(a.score)
  );

  return sorted[0]?.title ?? "未命名事件群組";
}

function makeClusterSummary(articles: Article[]) {
  const sources = unique(articles.map((article) => article.source));
  const topArticles = articles.slice(0, 3);

  return `此事件群組由 ${articles.length} 篇新聞組成，來源包括 ${sources.join(
    "、"
  )}。主要新聞包括：${topArticles
    .map((article) => `「${article.title}」`)
    .join("、")}。`;
}

function updateCluster(cluster: ClusterDraft) {
  const scores = cluster.articles.map((article) => toNumber(article.score));

  cluster.score = Math.max(...scores);
  cluster.title = makeClusterTitle(cluster.articles);
  cluster.summary = makeClusterSummary(cluster.articles);
  cluster.tags = unique(cluster.articles.flatMap((article) => article.topic_tags ?? []));
  cluster.matched_rules = unique(
    cluster.articles.flatMap((article) => article.matched_rules ?? [])
  );

  const regions = unique(cluster.articles.map((article) => article.region));
  const categories = unique(cluster.articles.map((article) => article.category));

  cluster.region = regions[0] ?? null;
  cluster.category = categories[0] ?? null;
}

function createInitialCluster(article: Article): ClusterDraft {
  const cluster: ClusterDraft = {
    title: article.title,
    summary: article.summary ?? "",
    score: toNumber(article.score),
    region: article.region,
    category: article.category,
    tags: article.topic_tags ?? [],
    matched_rules: article.matched_rules ?? [],
    articles: [article],
  };

  updateCluster(cluster);

  return cluster;
}

function buildClusters(articles: Article[]) {
  const clusters: ClusterDraft[] = [];

  for (const article of articles) {
    let bestCluster: ClusterDraft | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const similarity = articleSimilarity(article, cluster);

      if (shouldJoinCluster(article, cluster) && similarity > bestScore) {
        bestCluster = cluster;
        bestScore = similarity;
      }
    }

    if (bestCluster) {
      bestCluster.articles.push(article);
      updateCluster(bestCluster);
    } else {
      clusters.push(createInitialCluster(article));
    }
  }

  return clusters.sort((a, b) => b.score - a.score);
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: articles, error: articlesError } = await supabase
    .from("articles")
    .select(
      "id,title,source,url,published_at,summary,score,region,category,topic_tags,matched_rules"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (articlesError) {
    return NextResponse.json(
      { ok: false, error: articlesError.message },
      { status: 500 }
    );
  }

  const typedArticles = (articles ?? []) as Article[];
  const clusters = buildClusters(typedArticles);

  const { error: deleteRelationsError } = await supabase
    .from("cluster_articles")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteRelationsError) {
    return NextResponse.json(
      { ok: false, error: deleteRelationsError.message },
      { status: 500 }
    );
  }

  const { error: deleteClustersError } = await supabase
    .from("article_clusters")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteClustersError) {
    return NextResponse.json(
      { ok: false, error: deleteClustersError.message },
      { status: 500 }
    );
  }

  let insertedClusters = 0;
  let insertedRelations = 0;

  for (const cluster of clusters) {
    const sources = unique(cluster.articles.map((article) => article.source));

    const latestPublishedAt =
      cluster.articles
        .map((article) => article.published_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    const { data: insertedCluster, error: clusterError } = await supabase
      .from("article_clusters")
      .insert({
        title: cluster.title,
        summary: cluster.summary,
        score: cluster.score,
        region: cluster.region,
        category: cluster.category,
        tags: cluster.tags,
        matched_rules: cluster.matched_rules,
        article_count: cluster.articles.length,
        source_count: sources.length,
        latest_published_at: latestPublishedAt,
        status: "new",
      })
      .select("id")
      .single();

    if (clusterError || !insertedCluster) {
      return NextResponse.json(
        {
          ok: false,
          error: clusterError?.message ?? "Failed to insert cluster",
        },
        { status: 500 }
      );
    }

    insertedClusters += 1;

    const relations = cluster.articles.map((article) => ({
      cluster_id: insertedCluster.id,
      article_id: article.id,
    }));

    const { error: relationError } = await supabase
      .from("cluster_articles")
      .insert(relations);

    if (relationError) {
      return NextResponse.json(
        { ok: false, error: relationError.message },
        { status: 500 }
      );
    }

    insertedRelations += relations.length;
  }

  return NextResponse.json({
    ok: true,
    articles: typedArticles.length,
    clusters: insertedClusters,
    relations: insertedRelations,
  });
}