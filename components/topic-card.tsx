import Link from "next/link";
import { Topic } from "@/lib/types";
import { DeleteTopicButton } from "@/components/delete-topic-button";

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {topic.region} · {topic.category}
          </p>

          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            {topic.title}
          </h2>
        </div>

        <div className="rounded-xl bg-portal-50 px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Score</p>
          <p className="text-xl font-bold text-portal-700">{topic.score}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
        {topic.rationale}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {topic.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/topics/${topic.id}`}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          查看議題
        </Link>

        <DeleteTopicButton topicId={topic.id} />
      </div>
    </article>
  );
}