import { NextResponse } from "next/server";
import { toTraditionalChinese } from "@/lib/text";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_ARTICLES = 60;

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

const EVENT_STOP_WORDS = new Set([
  "的",
  "了",
  "和",
  "與",
  "及",
  "在",
  "對",
  "為",
  "是",
  "有",
  "將",
  "中",
  "後",
  "前",
  "說",
  "稱",
  "表示",
  "指出",
  "新聞",
  "報導",
  "最新",
  "包括",
  "主要",
  "美中競爭",
  "供應鏈",
  "軍事安全",
  "中東",
  "台灣政治",
  "國內政治",
  "歐洲安全",
  "北約",
  "台海",
  "灰色地帶",
  "東南亞",
  "區域安全",
  "科技供應鏈",
  "國際政治",
  "安全",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "said",
  "says",
  "new",
  "news",
]);

function extractEventKeywords(title: string, summary: string | null) {
  const text = `${title} ${summary ?? ""}`
    .replace(/[，。！？、；：「」『』（）()【】\[\],.!?:;"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const latinWords = text.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];
  const chineseChunks = text.match(/[\u4e00-\u9fff]{2,}/g) ?? [];

  const chineseTokens = chineseChunks.flatMap((chunk) => {
    const tokens: string[] = [];

    if (chunk.length <= 10) {
      tokens.push(chunk);
    }

    for (let size = 3; size <= 5; size += 1) {
      for (let i = 0; i <= chunk.length - size; i += 1) {
        tokens.push(chunk.slice(i, i + size));
      }
    }

    return tokens;
  });

  const tokens = [...latinWords, ...chineseTokens]
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !EVENT_STOP_WORDS.has(token))
    .filter((token) => !EVENT_STOP_WORDS.has(token.toLowerCase()));

  return Array.from(new Set(tokens)).slice(0, 20);
}

function makeEventFingerprint(title: string, summary: string | null) {
  const keywords = extractEventKeywords(title, summary);

  const fingerprint = keywords
    .slice(0, 6)
    .map((keyword) => keyword.toLowerCase())
    .join("-");

  return {
    event_fingerprint: fingerprint || title.slice(0, 30),
    event_keywords: keywords,
  };
}

async function pruneArticles(
  supabase: ReturnType<typeof createSupabaseServerClient>
) {
  const { data: oldArticles, error } = await supabase
    .from("articles")
    .select("id")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(MAX_ARTICLES, 1000);

  if (error) {
    return {
      deleted: 0,
      error: error.message,
    };
  }

  const idsToDelete = oldArticles?.map((article) => article.id) ?? [];

  if (idsToDelete.length === 0) {
    return {
      deleted: 0,
      error: null,
    };
  }

  const { error: deleteError } = await supabase
    .from("articles")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    return {
      deleted: 0,
      error: deleteError.message,
    };
  }

  return {
    deleted: idsToDelete.length,
    error: null,
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

  let upserted = 0;
  let skipped = 0;
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
        const traditionalTitle = toTraditionalChinese(item.title) ?? item.title;
        const traditionalSummary = toTraditionalChinese(item.summary);

        const analysis = analyseArticleWithRules(
          traditionalTitle,
          traditionalSummary,
          scoringRules ?? []
        );

        if (analysis.matched_rules.length === 0) {
          skipped += 1;
          continue;
        }

        const eventData = makeEventFingerprint(
          traditionalTitle,
          traditionalSummary
        );

        const { error } = await supabase.from("articles").upsert(
          {
            title: traditionalTitle,
            source: source.name,
            url: item.link,
            published_at: item.published_at,
            summary: traditionalSummary,
            full_text: null,
            score: analysis.score,
            region: analysis.region,
            category: analysis.category,
            topic_tags: analysis.topic_tags,
            matched_rules: analysis.matched_rules,
            event_fingerprint: eventData.event_fingerprint,
            event_keywords: eventData.event_keywords,
          },
          { onConflict: "url" }
        );

        if (error) {
          errors.push(`${source.name} / ${traditionalTitle}: ${error.message}`);
        } else {
          upserted += 1;
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

  const pruneResult = await pruneArticles(supabase);

  if (pruneResult.error) {
    errors.push(`Prune articles: ${pruneResult.error}`);
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skipped,
    deleted_old_articles: pruneResult.deleted,
    max_articles: MAX_ARTICLES,
    errors,
  });
}