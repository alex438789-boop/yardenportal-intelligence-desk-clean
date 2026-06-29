import { createSupabaseServerClient } from "@/lib/supabase";
import { CreateTopicButton } from "@/components/create-topic-button";
import { RefreshArticlesButton } from "@/components/refresh-articles-button";
import { DeleteArticleButton } from "@/components/delete-article-button";
import { SourceBubblePool } from "@/components/source-bubble-pool";

export const dynamic = "force-dynamic";

type Article = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  region: string | null;
  category: string | null;
  score: number | string | null;
  topic_tags: string[] | null;
  matched_rules: string[] | null;
  created_at: string;
};

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

export default async function ArticlesPage() {
  const supabase = createSupabaseServerClient();

  const { data: articles, error } = await supabase
    .from("articles")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">Articles</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load articles: {error.message}
        </p>
      </main>
    );
  }

  const articleList = (articles ?? []) as Article[];

  const sourceCounts = articleList.reduce<Record<string, number>>(
    (acc, article) => {
      acc[article.source] = (acc[article.source] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const sourceStats = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source,
      count,
      percentage:
        articleList.length > 0 ? (count / articleList.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            RSS Intelligence Feed
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            最新抓取新聞
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            這裡顯示通過 rules 篩選後的 RSS 新聞。按下「重新搜尋＋重建 Clusters」後，系統會重新抓取 RSS、轉繁體、套用關鍵字規則、貼標籤，並同步重建事件群組。下方的來源球池會顯示目前新聞池共有 {articleList.length} 篇文章，以及各來源的文章占比。
          </p>
        </div>

        <RefreshArticlesButton />
      </div>

      <SourceBubblePool
        stats={sourceStats}
        totalArticles={articleList.length}
      />

      <div className="grid gap-4">
        {articleList.map((article: Article) => (
          <article
            key={article.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {article.source}
              </span>

              <time className="text-xs text-slate-500">
                {formatDate(article.published_at)}
              </time>
            </div>

            <h2 className="text-lg font-bold leading-snug text-slate-950">
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {article.title}
              </a>
            </h2>

            {article.summary && (
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                {article.summary}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {article.score !== null && article.score !== undefined && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                  Score {Number(article.score).toFixed(1)}
                </span>
              )}

              {article.region && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                  {article.region}
                </span>
              )}

              {article.category && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                  {article.category}
                </span>
              )}

              {(article.topic_tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                >
                  #{tag}
                </span>
              ))}
            </div>

            {(article.matched_rules ?? []).length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                命中規則：{(article.matched_rules ?? []).join("、")}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <CreateTopicButton articleId={article.id} />
              <DeleteArticleButton articleId={article.id} />
            </div>
          </article>
        ))}
      </div>

      {articleList.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          目前還沒有 articles。請按上方「重新搜尋＋重建 Clusters」抓取 RSS。
        </div>
      )}
    </main>
  );
}