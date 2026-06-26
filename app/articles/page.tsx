import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Article = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  region: string | null;
  topic_tags: string[] | null;
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
    .order("published_at", { ascending: false })
    .limit(50);

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

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            RSS Intelligence Feed
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            最新抓取新聞
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            這裡顯示從 RSS 來源抓進 Supabase 的新聞。下一步可以把值得分析的新聞轉成 YardenPORTAL topic。
          </p>
        </div>

        <Link
          href="/api/cron/ingest"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          手動抓取 RSS
        </Link>
      </div>

      <div className="grid gap-4">
        {(articles ?? []).map((article: Article) => (
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
              {article.region && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                  {article.region}
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
          </article>
        ))}
      </div>

      {articles?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          目前還沒有 articles。請先打開 /api/cron/ingest 抓取 RSS。
        </div>
      )}
    </main>
  );
}