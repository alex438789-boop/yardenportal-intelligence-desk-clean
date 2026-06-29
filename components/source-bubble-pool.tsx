"use client";

import { useEffect, useMemo, useRef } from "react";

type SourceStat = {
  source: string;
  count: number;
  percentage: number;
};

type VisualBubble = {
  id: string;
  label: string;
  count: number;
  percentage: number;
  size: number;
  kind: "normal" | "reuters";
  children?: {
    label: string;
    count: number;
    percentage: number;
  }[];
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

function isReutersSource(source: string) {
  return source.toLowerCase().includes("reuters");
}

function cleanReutersLabel(source: string) {
  return source
    .replace(/^Google News Reuters/i, "")
    .replace(/^Reuters/i, "")
    .replace(/Feed$/i, "")
    .trim()
    .replace(/\s+/g, " ")
    || "General";
}

function getBubbleSize(count: number, maxCount: number) {
  const minSize = 90;
  const maxSize = 210;
  const ratio = Math.sqrt(count / Math.max(maxCount, 1));

  return Math.round(minSize + ratio * (maxSize - minSize));
}

export function SourceBubblePool({
  stats,
  totalArticles,
}: {
  stats: SourceStat[];
  totalArticles: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);

  const visualBubbles = useMemo<VisualBubble[]>(() => {
    if (stats.length === 0) return [];

    const reutersStats = stats.filter((item) => isReutersSource(item.source));
    const otherStats = stats.filter((item) => !isReutersSource(item.source));

    const reutersCount = reutersStats.reduce((sum, item) => sum + item.count, 0);

    const groupedStats = [
      ...otherStats,
      ...(reutersStats.length > 0
        ? [
            {
              source: "Reuters",
              count: reutersCount,
              percentage:
                totalArticles > 0 ? (reutersCount / totalArticles) * 100 : 0,
            },
          ]
        : []),
    ].sort((a, b) => b.count - a.count);

    const maxCount = Math.max(...groupedStats.map((item) => item.count), 1);

    const normalBubbles: VisualBubble[] = otherStats.map((item) => ({
      id: item.source,
      label: item.source,
      count: item.count,
      percentage: item.percentage,
      size: getBubbleSize(item.count, maxCount),
      kind: "normal",
    }));

    const reutersBubble: VisualBubble[] =
      reutersStats.length > 0
        ? [
            {
              id: "Reuters",
              label: "Reuters",
              count: reutersCount,
              percentage:
                totalArticles > 0 ? (reutersCount / totalArticles) * 100 : 0,
              size: getBubbleSize(reutersCount, maxCount) + 24,
              kind: "reuters",
              children: reutersStats
                .map((item) => ({
                  label: cleanReutersLabel(item.source),
                  count: item.count,
                  percentage:
                    reutersCount > 0 ? (item.count / reutersCount) * 100 : 0,
                }))
                .sort((a, b) => b.count - a.count),
            },
          ]
        : [];

    return [...reutersBubble, ...normalBubbles].sort((a, b) => b.count - a.count);
  }, [stats, totalArticles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || visualBubbles.length === 0) return;

    const rect = container.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    const states = visualBubbles.map((bubble, index) => {
      const radius = bubble.size / 2;

      return {
        x: Math.random() * Math.max(width - bubble.size, 1),
        y: Math.random() * Math.max(height * 0.45, 1),
        vx: (Math.random() - 0.5) * 1.4,
        vy: Math.random() * 1.2,
        radius,
        element: bubbleRefs.current[index],
      };
    });

    let animationFrame = 0;

    function animate() {
      const currentRect = container.getBoundingClientRect();
      width = currentRect.width;
      height = currentRect.height;

      const gravity = 0.18;
      const bounce = 0.78;
      const friction = 0.995;

      for (const state of states) {
        state.vy += gravity;

        state.x += state.vx;
        state.y += state.vy;

        if (state.x <= 0) {
          state.x = 0;
          state.vx = Math.abs(state.vx) * bounce;
        }

        if (state.x + state.radius * 2 >= width) {
          state.x = width - state.radius * 2;
          state.vx = -Math.abs(state.vx) * bounce;
        }

        if (state.y <= 0) {
          state.y = 0;
          state.vy = Math.abs(state.vy) * bounce;
        }

        if (state.y + state.radius * 2 >= height) {
          state.y = height - state.radius * 2;
          state.vy = -Math.abs(state.vy) * bounce;
          state.vx *= friction;
        }
      }

      for (let i = 0; i < states.length; i += 1) {
        for (let j = i + 1; j < states.length; j += 1) {
          const a = states[i];
          const b = states[j];

          const ax = a.x + a.radius;
          const ay = a.y + a.radius;
          const bx = b.x + b.radius;
          const by = b.y + b.radius;

          const dx = bx - ax;
          const dy = by - ay;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDistance = a.radius + b.radius + 8;

          if (distance < minDistance) {
            const overlap = (minDistance - distance) / 2;
            const nx = dx / distance;
            const ny = dy / distance;

            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;

            const tempVx = a.vx;
            const tempVy = a.vy;

            a.vx = b.vx * 0.86;
            a.vy = b.vy * 0.86;
            b.vx = tempVx * 0.86;
            b.vy = tempVy * 0.86;
          }
        }
      }

      states.forEach((state) => {
        if (!state.element) return;

        state.element.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
      });

      animationFrame = requestAnimationFrame(animate);
    }

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [visualBubbles]);

  if (visualBubbles.length === 0) return null;

  return (
    <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <style>
        {`
          @keyframes yp-inner-float {
            0% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-6px) rotate(2deg); }
            100% { transform: translateY(0px) rotate(0deg); }
          }

          @keyframes yp-soft-pulse {
            0% { box-shadow: 0 0 0 0 rgba(15, 23, 42, 0.12); }
            70% { box-shadow: 0 0 0 14px rgba(15, 23, 42, 0); }
            100% { box-shadow: 0 0 0 0 rgba(15, 23, 42, 0); }
          }
        `}
      </style>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Source Pool</p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            動態來源球池
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            這裡顯示目前新聞池中各來源的文章分布。球越大，代表該來源文章越多；Reuters 會被整合成一顆大球，內部小球代表不同 Reuters 主題來源。
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
            <p className="text-2xl font-bold text-slate-900">{stats.length}</p>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative mt-7 h-[520px] overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-200"
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-300/80 to-transparent" />

        {visualBubbles.map((bubble, index) => {
          const className =
            bubble.kind === "reuters"
              ? "bg-slate-950 text-white"
              : bubbleClasses[index % bubbleClasses.length];

          return (
            <div
              key={bubble.id}
              ref={(element) => {
                bubbleRefs.current[index] = element;
              }}
              className={`absolute left-0 top-0 flex shrink-0 flex-col items-center justify-center rounded-full text-center shadow-xl ring-1 ring-black/10 transition hover:z-20 hover:scale-105 ${className}`}
              style={{
                width: bubble.size,
                height: bubble.size,
                animation:
                  bubble.kind === "reuters"
                    ? "yp-soft-pulse 2.8s infinite"
                    : undefined,
              }}
              title={`${bubble.label}: ${bubble.count} 篇`}
            >
              {bubble.kind === "reuters" ? (
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/15 p-4">
                  <p className="text-sm font-semibold tracking-wide">
                    Reuters
                  </p>

                  <p className="mt-1 text-3xl font-bold">{bubble.count}</p>

                  <p className="text-[11px] text-slate-300">
                    {bubble.percentage.toFixed(1)}%
                  </p>

                  <div className="mt-3 flex max-w-[86%] flex-wrap items-center justify-center gap-1.5">
                    {(bubble.children ?? []).slice(0, 6).map((child, childIndex) => (
                      <div
                        key={child.label}
                        className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-white/15 text-[9px] font-medium text-white ring-1 ring-white/20 backdrop-blur"
                        style={{
                          animation: `yp-inner-float ${
                            2.4 + childIndex * 0.25
                          }s ease-in-out infinite`,
                        }}
                        title={`${child.label}: ${child.count} 篇`}
                      >
                        <span className="max-w-[42px] truncate">
                          {child.label}
                        </span>
                        <span className="text-[10px] font-bold">
                          {child.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className="max-w-[80%] truncate text-xs font-semibold">
                    {bubble.label}
                  </p>

                  <p className="mt-1 text-2xl font-bold">{bubble.count}</p>

                  <p className="text-[11px] opacity-75">
                    {bubble.percentage.toFixed(1)}%
                  </p>
                </>
              )}
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