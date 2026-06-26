import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type FeedItem = {
  title: string;
  link: string;
  summary: string | null;
  published_at: string | null;
};

type ScoringRule = {
  label: string;
  keywords: string[];
  score_delta: number | string;
  region: string | null;
  category: string | null;
  tags: string[] | null;
  is_active: boolean;
};

function stripCdata(value: string) {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function getTag(block: string, tag: string) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match ? stripCdata(match[1]) : "";
}

function safeDate(value: string) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function parseRss(xml: string): FeedItem[] {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  return itemBlocks
    .slice(0, 10)
    .map((item) => {
      const title = stripHtml(getTag(item, "title"));
      const link = stripHtml(getTag(item, "link"));
      const description = stripHtml(getTag(item, "description"));
      const pubDate = stripHtml(getTag(item, "pubDate"));

      return {
        title,
        link,
        summary: description || null,
        published_at: safeDate(pubDate),
      };
    })
    .filter((item) => item.title && item.link);
}

function includesAny(text: string, keywords: string[]) {
  const normalizedText = text.toLowerCase();

  return keywords.some((keyword) =>
    normalizedText.includes(keyword.toLowerCase())
  );
}

function analyseArticleWithRules(
  title: string,
  summary: string | null,
  rules: ScoringRule[]
) {
  const text = `${title} ${summary ?? ""}`;

  let score = 5.5;
  let region = "全球";
  let category = "國際政治";

  const topicTags = new Set<string>();
  const matchedRules = new Set<string>();

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const keywords = rule.keywords ?? [];

    if (includesAny(text, keywords)) {
      score += Number(rule.score_delta);

      if (rule.region) region = rule.region;
      if (rule.category) category = rule.category;

      for (const tag of rule.tags ?? []) {
        topicTags.add(tag);
      }

      matchedRules.add(rule.label);
    }
  }

  return {
    score: Math.min(10, Math.round(score * 10) / 10),
    region,
    category,
    topic_tags: Array.from(topicTags),
    matched_rules: Array.from(matchedRules),
  };
}

export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("*")
    .eq("is_active", true)
    .eq("type", "rss");

  if (sourcesError) {
    return NextResponse.json(
      { ok: false, error: sourcesError.message },
      { status: 500 }
    );
  }

  const { data: scoringRules, error: rulesError } = await supabase
    .from("scoring_rules")
    .select("label,keywords,score_delta,region,category,tags,is_active")
    .eq("is_active", true);

  if (rulesError) {
    return NextResponse.json(
      { ok: false, error: rulesError.message },
      { status: 500 }
    );
  }

  let inserted = 0;
  const errors: string[] = [];

  for (const source of sources ?? []) {
    try {
      const response = await fetch(source.url, {
        headers: {
          "User-Agent": "YardenPORTAL Intelligence Desk RSS Reader",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        errors.push(`${source.name}: HTTP ${response.status}`);
        continue;
      }

      const xml = await response.text();
      const items = parseRss(xml);

      for (const item of items) {
        const analysis = analyseArticleWithRules(
          item.title,
          item.summary,
          scoringRules ?? []
        );

        const { error } = await supabase.from("articles").upsert(
          {
            title: item.title,
            source: source.name,
            url: item.link,
            published_at: item.published_at,
            summary: item.summary,
            full_text: null,
            score: analysis.score,
            region: analysis.region,
            category: analysis.category,
            topic_tags: analysis.topic_tags,
            matched_rules: analysis.matched_rules,
          },
          { onConflict: "url" }
        );

        if (error) {
          errors.push(`${source.name} / ${item.title}: ${error.message}`);
        } else {
          inserted += 1;
        }
      }
    } catch (error) {
      errors.push(
        `${source.name}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    errors,
  });
}