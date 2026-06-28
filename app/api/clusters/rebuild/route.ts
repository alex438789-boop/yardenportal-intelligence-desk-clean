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
  event_fingerprint: string | null;
  event_keywords: string[] | null;
};

type ClusterDraft = {
  title: string;
  summary: string;
  score: number;
  region: string | null;
  category: string | null;
  tags: string[];
  matched_rules: string[];
  event_keywords: string[];
  event_fingerprint: string | null;
  articles: Article[];
};

const MAX_ARTICLES = 100;
const TIME_WINDOW_HOURS = 72;
const FINGERPRINT_OVERLAP_THRESHOLD = 3;

const BROAD_CLUSTER_TERMS = new Set([
  "美中競爭",
  "供應鏈",
  "軍事安全",
  "中東",
  "台灣政治",
  "國內政治",
  "歐洲安全",
  "北約",
  "台海",
  "灰色地帶",
  "東南亞",
  "區域安全",
  "科技供應鏈",
  "國際政治",
  "安全",
  "台美關係",
  "國會外交",
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

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function fallbackEventKeywords(article: Article) {
  const text = `${article.title} ${article.summary ?? ""}`
    .replace(/[，。！？、；：「」『』（）()【】\[\],.!?:;"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const latinWords = text.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];
  const chineseChunks = text.match(/[\u4e00-\u9fff]{3,}/g) ?? [];

  const chineseTokens = chineseChunks.flatMap((chunk) => {
    const tokens: string[] = [];

    if (chunk.length <= 10) tokens.push(chunk);

    for (let size = 3; size <= 5; size += 1) {
      for (let i = 0; i <= chunk.length - size; i += 1) {
        tokens.push(chunk.slice(i, i + size));
      }
    }

    return tokens;
  });

  return unique([...latinWords, ...chineseTokens])
    .filter((token) => token.length >= 3)
    .filter((token) => !BROAD_CLUSTER_TERMS.has(token))
    .slice(0, 20);
}

function getEventKeywords(article: Article) {
  const keywords =
    article.event_keywords && article.event_keywords.length > 0
      ? article.event_keywords
      : fallbackEventKeywords(article);

  return keywords.filter((keyword) => !BROAD_CLUSTER_TERMS.has(keyword));
}

function overlapCount(a: string[], b: string[]) {
  const setB = new Set(b.map((item) => normalize(item)));
  return a.filter((item) => setB.has(normalize(item))).length;
}

function getClusterEventKeywords(cluster: ClusterDraft) {
  return unique(
    cluster.articles.flatMap((article) => getEventKeywords(article))
  );
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

  return diffHours <= TIME_WINDOW_HOURS;
}

function fingerprintSimilarity(article: Article, cluster: ClusterDraft) {
  const articleKeywords = getEventKeywords(article);
  const clusterKeywords = getClusterEventKeywords(cluster);

  return overlapCount(articleKeywords, clusterKeywords);
}

function shouldJoinCluster(article: Article, cluster: ClusterDraft) {
  if (!isWithinTimeWindow(article, cluster)) return false;

  const overlap = fingerprintSimilarity(article, cluster);

  if (overlap >= FINGERPRINT_OVERLAP_THRESHOLD) return true;

  if (
    article.event_fingerprint &&
    cluster.event_fingerprint &&
    article.event_fingerprint === cluster.event_fingerprint
  ) {
    return true;
  }

  return false;
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

  cluster.tags = unique(
    cluster.articles.flatMap((article) => article.topic_tags ?? [])
  );

  cluster.matched_rules = unique(
    cluster.articles.flatMap((article) => article.matched_rules ?? [])
  );

  cluster.event_keywords = unique(
    cluster.articles.flatMap((article) => getEventKeywords(article))
  );

  const regions = unique(cluster.articles.map((article) => article.region));
  const categories = unique(cluster.articles.map((article) => article.category));
  const fingerprints = unique(
    cluster.articles.map((article) => article.event_fingerprint)
  );

  cluster.region = regions[0] ?? null;
  cluster.category = categories[0] ?? null;
  cluster.event_fingerprint = fingerprints[0] ?? null;
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
    event_keywords: getEventKeywords(article),
    event_fingerprint: article.event_fingerprint,
    articles: [article],
  };

  updateCluster(cluster);

  return cluster;
}

function buildClusters(articles: Article[]) {
  const clusters: ClusterDraft[] = [];

  for (const article of articles) {
    let bestCluster: ClusterDraft | null = null;
    let bestOverlap = 0;

    for (const cluster of clusters) {
      const overlap = fingerprintSimilarity(article, cluster);

      if (shouldJoinCluster(article, cluster) && overlap > bestOverlap) {
        bestCluster = cluster;
        bestOverlap = overlap;
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
      "id,title,source,url,published_at,summary,score,region,category,topic_tags,matched_rules,event_fingerprint,event_keywords"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ARTICLES);

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
    fingerprint_overlap_threshold: FINGERPRINT_OVERLAP_THRESHOLD,
    time_window_hours: TIME_WINDOW_HOURS,
  });
}