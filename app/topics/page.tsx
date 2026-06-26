import { TopicCard } from "@/components/topic-card";
import { getTopics } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const topics = await getTopics();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <p className="text-sm font-medium text-slate-500">
          Topic Intelligence Board
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Topics 議題庫
        </h1>

        <p className="mt-3 max-w-2xl text-slate-600">
          這裡儲存從新聞池轉換而來的候選議題。每個 topic 會依照你的 scoring rules 產生推薦分數、區域分類、議題標籤與後續分析問題。
        </p>
      </div>

      {topics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          目前還沒有 topics。請先到 Articles 新聞池，選擇值得分析的新聞並建立 topic。
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      )}
    </div>
  );
}