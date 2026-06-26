import { notFound } from "next/navigation";
import { GenerateDraftButton } from "@/components/generate-draft-button";
import { getTopic } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function TopicDetailPage({ params }: Props) {
  const { id } = await params;
  const topic = await getTopic(id);
  if (!topic) notFound();

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-portal-700">{topic.region} · {topic.category}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{topic.title}</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">{topic.rationale}</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">相關新聞來源</h2>
          <div className="mt-4 grid gap-3">
            {topic.articles.map((article) => (
              <a key={article.id} href={article.url} target="_blank" className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-slate-950">{article.title}</p>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{article.source}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>
                <p className="mt-2 text-xs text-slate-400">{article.publishedAt}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">值得觀察的問題</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
            {topic.keyQuestions.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </section>
      </article>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">推薦分數</p>
          <p className="mt-2 text-4xl font-bold text-portal-700">{topic.score}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {topic.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">#{tag}</span>)}
          </div>
        </div>
        <GenerateDraftButton topic={topic} />
      </aside>
    </div>
  );
}
