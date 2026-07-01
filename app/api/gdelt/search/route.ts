import { NextResponse } from "next/server";

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_REQUEST_DELAY_MS = 7000;
const GDELT_MAX_RETRIES = 1;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeGdeltUrl({
  query,
  mode,
  timespan,
  maxrecords = 10,
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

function getRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) return null;

  const seconds = Number(retryAfter);

  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const retryDate = new Date(retryAfter).getTime();
  const now = Date.now();

  if (!Number.isNaN(retryDate) && retryDate > now) {
    return retryDate - now;
  }

  return null;
}

async function fetchGdeltJson(url: string) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= GDELT_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          "User-Agent": "YardenPORTAL/1.0",
        },
      });

      if (response.status === 429) {
        const retryAfterMs = getRetryAfterMs(response);
        const waitMs = retryAfterMs ?? 12000 * (attempt + 1);

        await sleep(waitMs);
        lastError = new Error("GDELT request failed: 429");
        continue;
      }

      if (!response.ok) {
        throw new Error(`GDELT request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Unknown GDELT request error");

      await sleep(5000 * (attempt + 1));
    }
  }

  throw lastError ?? new Error("GDELT request failed after retries");
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
    const timeline72h = (await fetchGdeltJson(
      makeGdeltUrl({
        query,
        mode: "timelinevolraw",
        timespan: "3d",
      })
    )) as GdeltTimelineResponse;

    await sleep(GDELT_REQUEST_DELAY_MS);

    const artList = (await fetchGdeltJson(
      makeGdeltUrl({
        query,
        mode: "artlist",
        timespan: "3d",
        maxrecords: 10,
      })
    )) as GdeltArtListResponse;

    const volume72h = extractTimelineTotal(timeline72h);

    const articles = (artList.articles ?? [])
      .map(normalizeArticle)
      .filter((article) => article.url)
      .slice(0, 10);

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
      method: "Lightweight GDELT DOC API search using 3d timeline and article samples",
      query,
      volume_72h: volume72h,
      source_count: sourceCount,
      source_countries: sourceCountries,
      languages,
      articles,
      raw_preview: {
        timeline_72h_points: timeline72h.timeline?.slice(0, 8) ?? [],
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