import { TopicCard } from "@/components/topic-card";
import { getTopics } from "@/lib/db";

export default async function TopicsPage() {
  
  const topics = await getTopics();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-bold tracking-tight">Topics 議題庫</h1>
      <p className="mt-3 text-slate-600">這裡會儲存被系統評分後的候選議題。MVP 先使用你既有貼文改寫成的假資料。</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {topics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}
      </div>
    </div>
  );
}
