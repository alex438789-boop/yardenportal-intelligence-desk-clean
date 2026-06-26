import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type FeedItem = {
  title: string;
  link: string;
  summary: string | null;
  published_at: string | null;
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

export async function GET() {
  const supabase = createServerSupabaseClient();

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
        const { error } = await supabase.from("articles").upsert(
          {
            title: item.title,
            source: source.name,
            url: item.link,
            published_at: item.published_at,
            summary: item.summary,
            full_text: null,
            region: null,
            topic_tags: [],
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