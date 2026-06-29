type SourceStat = {
  source: string;
  count: number;
  percentage: number;
};

const bubbleClasses = [
  "bg-slate-900 text-white",
  "bg-indigo-100 text-indigo-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
];

export function SourceBubblePool({
  stats,
  totalArticles,
}: {
  stats: SourceStat[];
  totalArticles: number;
}) {
  if (stats.length === 0) return null;

  const maxCount = Math.max(...stats.map((item) => item.count));

  function getBubbleSize(count: number) {
    const minSize = 76;
    const maxSize = 178;
    const ratio = Math.sqrt(count / maxCount);

    return Math.round(minSize + ratio * (maxSize - minSize));
  }

  return (
    <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Source Pool
          </p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            來源球池
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            這裡顯示目前新聞池中各來源的文章分布。球越大，代表該來源在新聞池中的文章越多。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">Articles</p>
            <p className="text-2xl font-bold text-slate-900">
              {totalArticles}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">Sources</p>
            <p className="text-2xl font-bold text-slate-900">
              {stats.length}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-center gap-4 rounded-3xl bg-slate-50 p-6">
        {stats.map((item, index) => {
          const size = getBubbleSize(item.count);
          const className = bubbleClasses[index % bubbleClasses.length];

          return (
            <div
              key={item.source}
              className={`flex shrink-0 flex-col items-center justify-center rounded-full text-center shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-md ${className}`}
              style={{
                width: size,
                height: size,
              }}
              title={`${item.source}: ${item.count} 篇`}
            >
              <p className="max-w-[80%] truncate text-xs font-semibold">
                {item.source}
              </p>

              <p className="mt-1 text-2xl font-bold">
                {item.count}
              </p>

              <p className="text-[11px] opacity-75">
                {item.percentage.toFixed(1)}%
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((item) => (
          <div
            key={item.source}
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <span className="truncate text-slate-700">{item.source}</span>
            <span className="font-semibold text-slate-950">
              {item.count} 篇
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}