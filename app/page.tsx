import { TopicCard } from "@/components/topic-card";
import { getTopics } from "@/lib/db";

export default async function DashboardPage() {
  
  const topics = await getTopics();
  const averageScore = (topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length).toFixed(1);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-portal-700">Radar</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">今日推薦議題</h1>
          <p className="mt-3 max-w-2xl text-slate-600">先用假資料測試產品流程：議題評分、來源卡片、草稿生成與人工審核。</p>
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">推薦議題</p>
          <p className="mt-2 text-3xl font-bold">{topics.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">平均分數</p>
          <p className="mt-2 text-3xl font-bold">{averageScore}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">待審草稿</p>
          <p className="mt-2 text-3xl font-bold">1</p>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        {topics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}
      </section>
    </div>
  );
}
