import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

type SelectedFamily = {
  zh_title: string;
  event_scope: string;
  region: string;
  category: string;
  article_ids: string[];
  why_it_matters: string;
  recommendation: string;
  confidence: number;
};

type ArticleRecord = {
  id: string;
  title: string;
  source: string;
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isUuid(value: string) {

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(

    value

  );

}

function makeSummary(family: SelectedFamily) {
  const scopeLabel =
    family.event_scope === "macro_event"
      ? "大型連續事件"
      : family.event_scope === "topic_series"
        ? "議題追蹤線"
        : "同一事件";

  return `${family.why_it_matters}｜AI 判斷類型：${scopeLabel}。`;
}

function calculatePriorityScore(family: SelectedFamily, articles: ArticleRecord[]) {
  const sourceCount = unique(articles.map((article) => article.source)).length;
  const articleCount = articles.length;

  let score = 8;

  score += Math.min(articleCount, 8) * 0.8;
  score += Math.min(sourceCount, 5) * 1.2;
  score += Math.round((family.confidence ?? 0.7) * 5);

  if (family.event_scope === "macro_event") score += 2;
  if (family.recommendation === "merge_as_macro_cluster") score += 2;
  if (family.recommendation === "create_topic") score += 1;

  return Number(score.toFixed(1));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    families?: SelectedFamily[];
  } | null;

  const families = body?.families ?? [];

  if (families.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No selected AI families provided" },
      { status: 400 }
    );
  }

  const validFamilies = families

  .map((family) => ({

    ...family,

    article_ids: unique(family.article_ids ?? []).filter(isUuid),

  }))

  .filter((family) => family.article_ids.length >= 2);

  if (validFamilies.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Selected families must contain at least 2 article IDs",
      },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  const allArticleIds = unique(
    validFamilies.flatMap((family) => family.article_ids)
  );

  const { data: existingRelations, error: relationError } = await supabase
    .from("cluster_articles")
    .select("cluster_id, article_id")
    .in("article_id", allArticleIds);

  if (relationError) {
    return NextResponse.json(
      { ok: false, error: relationError.message },
      { status: 500 }
    );
  }

  const affectedClusterIds = unique(
    (existingRelations ?? []).map((relation) => relation.cluster_id)
  );

  if (affectedClusterIds.length > 0) {
    const { error: deleteRelationError } = await supabase
      .from("cluster_articles")
      .delete()
      .in("cluster_id", affectedClusterIds);

    if (deleteRelationError) {
      return NextResponse.json(
        { ok: false, error: deleteRelationError.message },
        { status: 500 }
      );
    }

    const { error: deleteClusterError } = await supabase
      .from("article_clusters")
      .delete()
      .in("id", affectedClusterIds);

    if (deleteClusterError) {
      return NextResponse.json(
        { ok: false, error: deleteClusterError.message },
        { status: 500 }
      );
    }
  }

  const createdClusters: Array<{
    id: string;
    title: string;
    articles: number;
  }> = [];

  for (const family of validFamilies) {
    const { data: articles, error: articlesError } = await supabase
      .from("articles")
      .select("id,title,source")
      .in("id", family.article_ids);

    if (articlesError) {
      return NextResponse.json(
        { ok: false, error: articlesError.message },
        { status: 500 }
      );
    }

    const typedArticles = (articles ?? []) as ArticleRecord[];

    if (typedArticles.length < 2) continue;

    const sourceCount = unique(
      typedArticles.map((article) => article.source)
    ).length;

    const { data: cluster, error: clusterError } = await supabase
      .from("article_clusters")
      .insert({
        title: family.zh_title,
        summary: makeSummary(family),
        region: family.region ?? "unknown",
        category: family.category ?? "AI-assisted",
        article_count: typedArticles.length,
        source_count: sourceCount,
        priority_score: calculatePriorityScore(family, typedArticles),
        summary_source: "gemini",
      })
      .select("id,title")
      .single();

    if (clusterError || !cluster) {
      return NextResponse.json(
        { ok: false, error: clusterError?.message ?? "Failed to create cluster" },
        { status: 500 }
      );
    }

    const clusterRelations = typedArticles.map((article) => ({
      cluster_id: cluster.id,
      article_id: article.id,
    }));

    const { error: linkError } = await supabase
      .from("cluster_articles")
      .insert(clusterRelations);

    if (linkError) {
      return NextResponse.json(
        { ok: false, error: linkError.message },
        { status: 500 }
      );
    }

    createdClusters.push({
      id: cluster.id,
      title: cluster.title,
      articles: typedArticles.length,
    });
  }

  return NextResponse.json({
    ok: true,
    method: "apply selected Gemini dominant event families as clusters",
    selected_families: validFamilies.length,
    affected_old_clusters: affectedClusterIds.length,
    created_clusters: createdClusters.length,
    clusters: createdClusters,
  });
}