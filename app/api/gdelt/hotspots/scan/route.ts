import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

type HotspotSeed = {
  key: string;
  query: string;
  title: string;
  region: string;
  eventTypes: string[];
  keywords: string[];
};

const HOTSPOT_SEEDS: HotspotSeed[] = [
  {
    key: "middle-east-missile-airstrike-ceasefire",
    query: '(Middle East OR Iran OR Israel OR Lebanon OR Syria) (missile OR airstrike OR ceasefire OR strike OR attack)',
    title: "Middle East missile / airstrike / ceasefire activity",
    region: "中東",
    eventTypes: ["military_conflict", "ceasefire"],
    keywords: ["Middle East", "Iran", "Israel", "missile", "airstrike", "ceasefire"],
  },
  {
    key: "middle-east-nuclear-sanctions",
    query: '(Iran OR IAEA OR nuclear OR uranium) (sanctions OR inspectors OR nuclear OR agreement)',
    title: "Iran nuclear and sanctions activity",
    region: "中東",
    eventTypes: ["nuclear_diplomacy", "sanctions"],
    keywords: ["Iran", "IAEA", "nuclear", "uranium", "sanctions"],
  },
  {
    key: "red-sea-shipping-security",
    query: '(Red Sea OR Houthi OR Yemen OR shipping OR vessel) (attack OR missile OR drone OR shipping OR maritime)',
    title: "Red Sea shipping security",
    region: "中東",
    eventTypes: ["maritime_security", "military_conflict"],
    keywords: ["Red Sea", "Houthi", "Yemen", "shipping", "vessel"],
  },
  {
    key: "south-china-sea-coast-guard",
    query: '(South China Sea OR Philippines OR China coast guard) (coast guard OR maritime OR patrol OR collision OR water cannon)',
    title: "South China Sea coast guard tensions",
    region: "東南亞",
    eventTypes: ["maritime_security", "gray_zone"],
    keywords: ["South China Sea", "Philippines", "China", "coast guard", "patrol"],
  },
  {
    key: "taiwan-china-gray-zone",
    query: '(Taiwan OR China OR PLA OR coast guard) (military drills OR blockade OR patrol OR incursion OR gray zone)',
    title: "Taiwan Strait gray-zone and military activity",
    region: "台海",
    eventTypes: ["gray_zone", "military_conflict"],
    keywords: ["Taiwan", "China", "PLA", "coast guard", "military drills"],
  },
  {
    key: "southeast-asia-border-conflict",
    query: '(Southeast Asia OR Thailand OR Cambodia OR Myanmar) (border clash OR military conflict OR troops OR airstrike)',
    title: "Southeast Asia border and military conflict",
    region: "東南亞",
    eventTypes: ["border_conflict", "military_conflict"],
    keywords: ["Southeast Asia", "Thailand", "Cambodia", "Myanmar", "border clash"],
  },
  {
    key: "myanmar-junta-conflict",
    query: '(Myanmar OR junta OR rebels) (airstrike OR civil war OR sanctions OR border OR refugees)',
    title: "Myanmar junta and civil conflict",
    region: "東南亞",
    eventTypes: ["civil_conflict", "humanitarian_security"],
    keywords: ["Myanmar", "junta", "rebels", "airstrike", "civil war"],
  },
  {
    key: "russia-ukraine-war",
    query: '(Russia OR Ukraine) (missile OR drone OR strike OR ceasefire OR sanctions)',
    title: "Russia–Ukraine war activity",
    region: "歐洲",
    eventTypes: ["military_conflict", "sanctions"],
    keywords: ["Russia", "Ukraine", "missile", "drone", "sanctions"],
  },
  {
    key: "us-china-export-controls",
    query: '(United States OR China OR semiconductor OR chip OR AI) (export controls OR sanctions OR restrictions OR tariff)',
    title: "US–China export controls and technology restrictions",
    region: "美中",
    eventTypes: ["export_control", "tech_competition"],
    keywords: ["United States", "China", "semiconductor", "AI", "export controls"],
  },
  {
    key: "global-election-crisis",
    query: '(election OR coalition government OR no confidence OR protest) (crisis OR disputed OR government formation OR parliament)',
    title: "Global election and government formation risk",
    region: "全球",
    eventTypes: ["election", "government_formation", "protest"],
    keywords: ["election", "coalition government", "no confidence", "protest"],
  },
];

function makeGdeltUrl(query: string, mode: "timelinevolraw" | "artlist", timespan: string) {
  const url = new URL(GDELT_DOC_API);

  url.searchParams.set("query", query);
  url.searchParams.set("mode", mode);
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("maxrecords", "20");
  url.searchParams.set("sort", "hybridrel");

  return url.toString();
}

async function fetchJson(url: string) {
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

function extractTimelineTotal(data: unknown) {
  const maybeData = data as {
    timeline?: Array<{ value?: number | string }>;
  };

  const timeline = maybeData.timeline ?? [];

  return timeline.reduce((sum, item) => {
    const value = Number(item.value ?? 0);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);
}

function extractArticles(data: unknown) {
  const maybeData = data as {
    articles?: Array<{
      url?: string;
      title?: string;
      domain?: string;
      language?: string;
      sourcecountry?: string;
      seendate?: string;
    }>;
  };

  return maybeData.articles ?? [];
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

function calculateConfidence({
  volume24h,
  volume72h,
  baselineVolume,
  sourceCount,
}: {
  volume24h: number;
  volume72h: number;
  baselineVolume: number;
  sourceCount: number;
}) {
  let confidence = 0.45;

  if (volume24h >= 20) confidence += 0.1;
  if (volume24h >= 50) confidence += 0.1;
  if (volume72h >= 100) confidence += 0.1;
  if (sourceCount >= 5) confidence += 0.1;
  if (sourceCount >= 10) confidence += 0.1;

  const spikeRatio = baselineVolume > 0 ? volume24h / baselineVolume : volume24h;

  if (spikeRatio >= 2) confidence += 0.05;
  if (spikeRatio >= 5) confidence += 0.1;

  return Math.min(confidence, 0.95);
}

function calculateSeverity(volume24h: number, spikeRatio: number, sourceCount: number) {
  if (volume24h >= 100 || spikeRatio >= 8 || sourceCount >= 20) return 5;
  if (volume24h >= 50 || spikeRatio >= 5 || sourceCount >= 12) return 4;
  if (volume24h >= 20 || spikeRatio >= 3 || sourceCount >= 6) return 3;
  if (volume24h >= 8 || spikeRatio >= 2) return 2;
  return 1;
}

async function estimateCoverageStatus(seed: HotspotSeed) {
  const supabase = createSupabaseServerClient();

  const searchTerms = seed.keywords.slice(0, 4);

  if (searchTerms.length === 0) return "unknown";

  const { data: articles } = await supabase
    .from("articles")
    .select("id,title,summary")
    .limit(150);

  const matchedCount = (articles ?? []).filter((article) => {
    const text = `${article.title ?? ""} ${article.summary ?? ""}`.toLowerCase();

    return searchTerms.some((term) => text.includes(term.toLowerCase()));
  }).length;

  if (matchedCount >= 2) return "covered";
  if (matchedCount === 1) return "partially_covered";
  return "missing";
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const results: Array<{
    key: string;
    title: string;
    volume_24h: number;
    volume_72h: number;
    baseline_volume: number;
    spike_ratio: number;
    source_count: number;
    coverage_status: string;
    saved: boolean;
    error?: string;
  }> = [];

  for (const seed of HOTSPOT_SEEDS) {
    try {
      const timeline24h = await fetchJson(
        makeGdeltUrl(seed.query, "timelinevolraw", "1d")
      );

      const timeline72h = await fetchJson(
        makeGdeltUrl(seed.query, "timelinevolraw", "3d")
      );

      const timeline7d = await fetchJson(
        makeGdeltUrl(seed.query, "timelinevolraw", "7d")
      );

      const artList = await fetchJson(makeGdeltUrl(seed.query, "artlist", "3d"));

      const volume24h = extractTimelineTotal(timeline24h);
      const volume72h = extractTimelineTotal(timeline72h);
      const volume7d = extractTimelineTotal(timeline7d);
      const baselineVolume = Math.max(Math.round(volume7d / 7), 1);
      const spikeRatio = Number((volume24h / baselineVolume).toFixed(2));

      const articles = extractArticles(artList);
      const sampleUrls = unique(articles.map((article) => article.url)).slice(0, 8);
      const domains = unique(articles.map((article) => article.domain));
      const sourceCount = domains.length;

      const confidence = calculateConfidence({
        volume24h,
        volume72h,
        baselineVolume,
        sourceCount,
      });

      const severity = calculateSeverity(volume24h, spikeRatio, sourceCount);
      const coverageStatus = await estimateCoverageStatus(seed);

      const shouldSave =
        volume24h >= 8 || volume72h >= 20 || spikeRatio >= 2 || sourceCount >= 5;

      if (shouldSave) {
        const { error } = await supabase.from("gdelt_hotspots").insert({
          query: seed.query,
          hotspot_key: seed.key,
          title: seed.title,
          summary: `GDELT detected elevated coverage for: ${seed.title}.`,
          region: seed.region,
          country: null,
          actors: [],
          locations: [],
          keywords: seed.keywords,
          event_types: seed.eventTypes,
          volume_24h: volume24h,
          volume_72h: volume72h,
          baseline_volume: baselineVolume,
          spike_ratio: spikeRatio,
          source_count: sourceCount,
          sample_urls: sampleUrls,
          coverage_status: coverageStatus,
          confidence,
          raw: {
            seed,
            timeline24h,
            timeline72h,
            timeline7d,
            sample_articles: articles.slice(0, 10),
          },
        });

        if (error) throw new Error(error.message);
      }

      results.push({
        key: seed.key,
        title: seed.title,
        volume_24h: volume24h,
        volume_72h: volume72h,
        baseline_volume: baselineVolume,
        spike_ratio: spikeRatio,
        source_count: sourceCount,
        coverage_status: coverageStatus,
        saved: shouldSave,
      });
    } catch (error) {
      results.push({
        key: seed.key,
        title: seed.title,
        volume_24h: 0,
        volume_72h: 0,
        baseline_volume: 0,
        spike_ratio: 0,
        source_count: 0,
        coverage_status: "unknown",
        saved: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    method: "gdelt hotspot scan using DOC API timeline volume and article samples",
    scanned: HOTSPOT_SEEDS.length,
    saved: results.filter((result) => result.saved).length,
    results,
  });
}