import { NextResponse } from "next/server";

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

type GdeltArticle = {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

type GdeltTimelinePoint = {
  date?: string;
  value?: number | string;
};

type GdeltArtListResponse = {
  articles?: GdeltArticle[];
};

type GdeltTimelineResponse = {
  timeline?: GdeltTimelinePoint[];
};

function makeGdeltUrl({
  query,
  mode,
  timespan,
  maxrecords = 20,
}: {
  query: string;
  mode: "artlist" | "timelinevolraw";
  timespan: string;
  maxrecords?: number;
}) {
  const url = new URL(GDELT_DOC_API);

  url.searchParams.set("query", query);
  url.searchParams.set("mode", mode);
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("maxrecords", String(maxrecords));
  url.searchParams.set("sort", "hybridrel");

  return url.toString();
}

async function fetchGdeltJson(url: string) {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "YardenPORTAL/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`GDELT request failed: ${response.status}`);
  }

  return response.json();
}

function extractTimelineTotal(data: GdeltTimelineResponse) {
  const timeline = data.timeline ?? [];

  return timeline.reduce((sum, item) => {
    const value = Number(item.value ?? 0);

    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
}

function unique(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function normalizeArticle(article: GdeltArticle) {
  return {
    title: article.title ?? "Untitled",
    url: article.url ?? article.url_mobile ?? "",
    domain: article.domain ?? "unknown",
    language: article.language ?? "unknown",
    sourcecountry: article.sourcecountry ?? "unknown",
    seendate: article.seendate ?? null,
    socialimage: article.socialimage ?? null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing query. Use /api/gdelt/search?q=your search terms",
      },
      { status: 400 }
    );
  }

  try {
    const [timeline24h, timeline72h, timeline7d, artList] = await Promise.all([
      fetchGdeltJson(
        makeGdeltUrl({
          query,
          mode: "timelinevolraw",
          timespan: "1d",
        })
      ) as Promise<GdeltTimelineResponse>,
      fetchGdeltJson(
        makeGdeltUrl({
          query,
          mode: "timelinevolraw",
          timespan: "3d",
        })
      ) as Promise<GdeltTimelineResponse>,
      fetchGdeltJson(
        makeGdeltUrl({
          query,
          mode: "timelinevolraw",
          timespan: "7d",
        })
      ) as Promise<GdeltTimelineResponse>,
      fetchGdeltJson(
        makeGdeltUrl({
          query,
          mode: "artlist",
          timespan: "3d",
          maxrecords: 20,
        })
      ) as Promise<GdeltArtListResponse>,
    ]);

    const volume24h = extractTimelineTotal(timeline24h);
    const volume72h = extractTimelineTotal(timeline72h);
    const volume7d = extractTimelineTotal(timeline7d);

    const baselineVolume = Math.max(Math.round(volume7d / 7), 1);
    const spikeRatio = Number((volume24h / baselineVolume).toFixed(2));

    const articles = (artList.articles ?? [])
      .map(normalizeArticle)
      .filter((article) => article.url)
      .slice(0, 20);

    const sourceCount = unique(articles.map((article) => article.domain)).length;
    const sourceCountries = unique(
      articles.map((article) => article.sourcecountry)
    ).slice(0, 12);
    const languages = unique(articles.map((article) => article.language)).slice(
      0,
      12
    );

    return NextResponse.json({
      ok: true,
      method: "GDELT DOC API search with timeline volume and article samples",
      query,
      volume_24h: volume24h,
      volume_72h: volume72h,
      volume_7d: volume7d,
      baseline_volume: baselineVolume,
      spike_ratio: spikeRatio,
      source_count: sourceCount,
      source_countries: sourceCountries,
      languages,
      articles,
      raw_preview: {
        timeline_24h_points: timeline24h.timeline?.slice(0, 5) ?? [],
        timeline_72h_points: timeline72h.timeline?.slice(0, 5) ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to search GDELT DOC API",
      },
      { status: 500 }
    );
  }
}