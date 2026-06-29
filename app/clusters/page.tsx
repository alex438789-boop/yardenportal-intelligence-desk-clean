import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase";
import { RebuildClustersButton } from "@/components/rebuild-clusters-button";

export const dynamic = "force-dynamic";

type ClusterArticleRelation = {
  articles:
    | {
        id: string;
        title: string;
        source: string;
        url: string;
        published_at: string | null;
      }
    | {
        id: string;
        title: string;
        source: string;
        url: string;
        published_at: string | null;
      }[]
    | null;
};

type Cluster = {
  id: string;
  title: string;
  summary: string | null;
  score: number | string | null;
  region: string | null;
  category: string | null;
  tags: string[] | null;
  matched_rules: string[] | null;
  article_count: number | null;
  source_count: number | null;
  latest_published_at: string | null;
  status: string | null;
  created_at: string;
  cluster_articles: ClusterArticleRelation[] | null;
};

type EnrichedCluster = Cluster & {
  priority_score: number;
  priority_reason: string[];
  importance_level: "高優先" | "值得追蹤" | "一般事件";
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 5.5;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 5.5 : numberValue;
}

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

function hoursSince(date: string | null) {
  if (!date) return 9999;

  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return 9999;

  return Math.max(0, (Date.now() - time) / 1000 / 60 / 60);
}

function getRecencyBonus(cluster: Cluster) {
  const hours = hoursSince(cluster.latest_published_at);

  if (hours <= 24) return 1.5;
  if (hours <= 48) return 1.0;
  if (hours <= 72) return 0.5;

  return 0;
}

function getCategoryBonus(cluster: Cluster) {
  const text = [
    cluster.category,
    cluster.region,
    ...(cluster.tags ?? []),
    ...(cluster.matched_rules ?? []),
  ].join(" ");

  if (/安全|衝突|軍事|台海|中東|國防|戰爭/.test(text)) return 1.2;
  if (/科技|半導體|晶片|人工智慧|AI|供應鏈/.test(text)) return 1.0;
  if (/經貿|貿易|關稅|制裁|產業|投資/.test(text)) return 1.0;
  if (/政治|選舉|政府組成|政權轉移/.test(text)) return 0.8;
  if (/永續|氣候|ESG|淨零|碳/.test(text)) return 0.6;

  return 0;
}

function getRiskBonus(cluster: Cluster) {
  const text = [
    cluster.title,
    cluster.summary,
    cluster.category,
    cluster.region,
    ...(cluster.tags ?? []),
    ...(cluster.matched_rules ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const riskSignals = [
    "軍事升溫",
    "攻擊",
    "空襲",
    "戰爭",
    "封鎖",
    "制裁",
    "關稅",
    "出口管制",
    "供應鏈風險",
    "政權轉移",
    "選舉爭議",
    "停火",
    "危機",
    "strike",
    "attack",
    "sanction",
    "tariff",
    "export control",
    "ceasefire",
    "war",
  ];

  const matches = riskSignals.filter((signal) =>
    text.includes(signal.toLowerCase())
  );

  return Math.min(matches.length * 0.35, 1.4);
}

function calculatePriority(cluster: Cluster): EnrichedCluster {
  const baseScore = toNumber(cluster.score);
  const articleCount = cluster.article_count ?? 1;
  const sourceCount = cluster.source_count ?? 1;

  const articleBonus = Math.min(articleCount * 0.5, 2.5);
  const sourceBonus = Math.min(sourceCount * 1.0, 3.0);
  const recencyBonus = getRecencyBonus(cluster);
  const categoryBonus = getCategoryBonus(cluster);
  const riskBonus = getRiskBonus(cluster);

  const priorityScore =
    baseScore + articleBonus + sourceBonus + recencyBonus + categoryBonus + riskBonus;

  const reasons: string[] = [];

  if (sourceCount >= 2) reasons.push(`${sourceCount} 個來源追蹤`);
  if (articleCount >= 3) reasons.push(`${articleCount} 篇文章形成事件線`);
  if (recencyBonus >= 1.5) reasons.push("24 小時內最新發展");
  else if (recencyBonus >= 1.0) reasons.push("48 小時內更新");

  if (categoryBonus >= 1.0) reasons.push("具政策 / 產業 / 安全相關性");
  if (riskBonus >= 0.7) reasons.push("含風險訊號");

  const importanceLevel =
    priorityScore >= 12
      ? "高優先"
      : priorityScore >= 9
        ? "值得追蹤"
        : "一般事件";

  return {
    ...cluster,
    priority_score: Math.round(priorityScore * 10) / 10,
    priority_reason: reasons.length > 0 ? reasons : ["一般事件追蹤"],
    importance_level: importanceLevel,
  };
}

function isTaiwanRelated(cluster: Cluster) {
  const text = [
    cluster.title,
    cluster.summary,
    cluster.region,
    cluster.category,
    ...(cluster.tags ?? []),
    ...(cluster.matched_rules ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const keywords = [
    "台灣",
    "臺灣",
    "taiwan",
    "台海",
    "臺海",
    "taiwan strait",
    "金門",
    "馬祖",
    "台積電",
    "tsmc",
    "賴清德",
    "國防部",
    "外交部",
    "陸委會",
  ];

  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function getRelatedArticles(cluster: Cluster) {
  return (cluster.cluster_articles ?? [])
    .flatMap((relation) => {
      if (!relation.articles) return [];
      return Array.isArray(relation.articles)
        ? relation.articles
        : [relation.articles];
    })
    .filter(Boolean);
}

function ClusterCard({
  cluster,
  compact = false,
}: {
  cluster: EnrichedCluster;
  compact?: boolean;
}) {
  const relatedArticles = getRelatedArticles(cluster);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          Priority {cluster.priority_score.toFixed(1)}
        </span>

        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          {cluster.importance_level}
        </span>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          {cluster.article_count ?? relatedArticles.length} articles
        </span>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          {cluster.source_count ?? 1} sources
        </span>

        {cluster.category && (
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
            {cluster.category}
          </span>
        )}

        {cluster.region && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
            {cluster.region}
          </span>
        )}
      </div>

      <h2 className="text-lg font-bold leading-snug text-slate-950">
        {cluster.title}
      </h2>

      <p className="mt-2 text-xs text-slate-500">
        最新更新：{formatDate(cluster.latest_published_at)}
      </p>

      {cluster.summary && !compact && (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {cluster.summary}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {cluster.priority_reason.map((reason) => (
          <span
            key={reason}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
          >
            {reason}
          </span>
        ))}
      </div>

      {(cluster.tags ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(cluster.tags ?? []).slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-700"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {!compact && relatedArticles.length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Related Articles
          </p>

          <div className="space-y-2">
            {relatedArticles.slice(0, 5).map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-slate-200 bg-white p-3 text-sm hover:bg-slate-50"
              >
                <p className="font-medium text-slate-900">{article.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {article.source} · {formatDate(article.published_at)}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function Section({

  id,

  title,

  description,

  clusters,

  compact = false,

}: {

  id?: string;

  title: string;

  description: string;

  clusters: EnrichedCluster[];

  compact?: boolean;

}) {
  if (clusters.length === 0) return null;

  return (
    <section id={id} className="scroll-mt-10 mb-10">
      <div className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="grid gap-4">
        {clusters.map((cluster) => (
          <ClusterCard
            key={`${title}-${cluster.id}`}
            cluster={cluster}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );
}

export default async function ClustersPage() {
  const supabase = createSupabaseServerClient();

  const { data: clusters, error } = await supabase
    .from("article_clusters")
    .select(
      `
      *,
      cluster_articles (
        articles (
          id,
          title,
          source,
          url,
          published_at
        )
      )
    `
    )
    .order("latest_published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">Clusters 事件群組</h1>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load clusters: {error.message}
        </p>
      </main>
    );
  }

  const enrichedClusters = ((clusters ?? []) as Cluster[])
    .map(calculatePriority)
    .sort((a, b) => b.priority_score - a.priority_score);

  const topPriority = enrichedClusters.slice(0, 6);

  const latestDeveloping = [...enrichedClusters]
    .filter((cluster) => hoursSince(cluster.latest_published_at) <= 72)
    .sort(
      (a, b) =>
        new Date(b.latest_published_at ?? 0).getTime() -
        new Date(a.latest_published_at ?? 0).getTime()
    )
    .slice(0, 5);

  const multiSource = enrichedClusters
    .filter((cluster) => (cluster.source_count ?? 1) >= 2)
    .slice(0, 5);

  const taiwanWatch = enrichedClusters.filter(isTaiwanRelated).slice(0, 5);

  const highPriorityCount = enrichedClusters.filter(
    (cluster) => cluster.importance_level === "高優先"
  ).length;

  const multiSourceCount = enrichedClusters.filter(
    (cluster) => (cluster.source_count ?? 1) >= 2
  ).length;

  const taiwanCount = enrichedClusters.filter(isTaiwanRelated).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Story Clusters
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Clusters 事件群組
          </h1>

          <p className="mt-3 max-w-3xl text-slate-600">
            這裡將通過篩選的 articles 聚合成事件群組。排序依據事件優先級、來源數、新鮮度、風險訊號與政策／產業相關性；台灣相關事件會放入 Taiwan Watch 作為追蹤群組，但不會自動獲得額外排序加權。
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

      <section className="mb-10 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total Clusters</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {enrichedClusters.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">High Priority</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {highPriorityCount}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Multi-source</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {multiSourceCount}
          </p>
        </div>

        <a
          href="#taiwan-watch"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"

>
          <p className="text-xs font-medium text-slate-500">Taiwan Watch</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {taiwanCount}
          </p>
          <p className="mt-2 text-xs text-slate-400">點擊跳到追蹤區塊</p>
</a>
        </div>
      </section>

      <Section
        title="🔥 Top Priority 高優先事件"
        description="依照事件重要性、來源數、新鮮度、風險訊號與政策／產業相關性排序，不特別加權台灣。"
        clusters={topPriority}
      />

      <Section
        title="🆕 Latest Developing 最新發展"
        description="最近 72 小時內仍在更新的事件，適合快速掌握最新動態。"
        clusters={latestDeveloping}
        compact
      />

      <Section
        title="📈 Multi-source Tracking 多來源追蹤"
        description="至少兩個來源共同追蹤的事件，代表事件有較高確認度或跨媒體關注度。"
        clusters={multiSource}
        compact
      />

      <Section
        id="taiwan-watch"
        title="🇹🇼 Taiwan Watch 台灣追蹤"
        description="與台灣、台海、金門、馬祖、台積電或台灣政府機構相關的事件；這是追蹤區塊，不影響 Top Priority 排序。"
        clusters={taiwanWatch}
        compact
      />

      {enrichedClusters.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          目前還沒有 clusters。請先到 Articles 重新搜尋並重建 Clusters。
        </div>
      )}
    </main>
  );
}