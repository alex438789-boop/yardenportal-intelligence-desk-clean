import Link from "next/link";
import { RebuildClustersButton } from "@/components/rebuild-clusters-button";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function formatDate(date: string | null) {
  if (!date) return "Unknown date";

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export default async function ClustersPage() {
  const supabase = createSupabaseServerClient();

  const { data: clusters, error } = await supabase
    .from("article_clusters")
    .select(
      `
      id,
      title,
      summary,
      score,
      region,
      category,
      tags,
      matched_rules,
      article_count,
      source_count,
      latest_published_at,
      status,
      cluster_articles (
        article_id,
        articles (
          id,
          title,
          source,
          url,
          published_at,
          summary
        )
      )
    `
    )
    .order("score", { ascending: false })
    .order("latest_published_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">Story Clusters</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load clusters: {error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Story Clusters
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            事件群組
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            這裡會把新聞池中相似的 articles 聚合成同一個事件群組。你可以從多篇相關新聞建立一個更完整的 topic。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <RebuildClustersButton />

          <Link
            href="/articles"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            回 Articles
          </Link>
        </div>
      </div>

      {(clusters ?? []).length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          目前還沒有 clusters。請先到 Articles 新聞池按「重新搜尋」，再回來按「重新整理 Clusters」。
        </div>
      )}

      <div className="grid gap-5">
        {(clusters ?? []).map((cluster: any) => (
          <article
            key={cluster.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {cluster.region ?? "未分類"} · {cluster.category ?? "未分類"}
                </p>

                <h2 className="mt-2 text-xl font-bold leading-snug text-slate-950">
                  {cluster.title}
                </h2>

                <p className="mt-2 text-xs text-slate-500">
                  最新時間：{formatDate(cluster.latest_published_at)}
                </p>
              </div>

              <div className="flex gap-3">
                <div className="rounded-xl bg-portal-50 px-3 py-2 text-center">
                  <p className="text-xs text-slate-500">Score</p>
                  <p className="text-xl font-bold text-portal-700">
                    {Number(cluster.score ?? 0).toFixed(1)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-100 px-3 py-2 text-center">
                  <p className="text-xs text-slate-500">Articles</p>
                  <p className="text-xl font-bold text-slate-700">
                    {cluster.article_count ?? 0}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-100 px-3 py-2 text-center">
                  <p className="text-xs text-slate-500">Sources</p>
                  <p className="text-xl font-bold text-slate-700">
                    {cluster.source_count ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {cluster.summary && (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {cluster.summary}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {(cluster.tags ?? []).map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>

            {(cluster.matched_rules ?? []).length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                命中規則：{(cluster.matched_rules ?? []).join("、")}
              </p>
            )}

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-800">
                相關新聞
              </h3>

              <div className="mt-3 space-y-3">
                {(cluster.cluster_articles ?? []).map((relation: any) => {
                  const article = Array.isArray(relation.articles)
                    ? relation.articles[0]
                    : relation.articles;

                  if (!article) return null;

                  return (
                    <div
                      key={relation.article_id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{article.source}</span>
                        <span>·</span>
                        <span>{formatDate(article.published_at)}</span>
                      </div>

                      <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-sm font-semibold text-slate-900 hover:underline"
                      >
                        {article.title}
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                disabled
                className="rounded-xl bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
              >
                Create Topic from Cluster 下一步做
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}