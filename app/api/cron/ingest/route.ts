import { NextResponse } from "next/server";
import { toTraditionalChinese } from "@/lib/text";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_ARTICLES = 150;
const MIN_ARTICLE_SCORE = 5.8;

type FeedItem = {
  title: string;
  link: string;
  summary: string | null;
  published_at: string | null;
};

type ScoringRule = {
  label: string;
  keywords: string[] | null;
  must_keywords: string[] | null;
  boost_keywords: string[] | null;
  exclude_keywords: string[] | null;
  score_delta: number | string;
  region: string | null;
  category: string | null;
  tags: string[] | null;
  domain_tags: string[] | null;
  region_tags: string[] | null;
  risk_tags: string[] | null;
  rule_type: string | null;
  priority: number | null;
  is_active: boolean;
};

type Source = {
  id: string;
  name: string;
  url: string;
  type: string;
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

function normalizeText(value: string) {
  return value.toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLatinKeyword(value: string) {
  return /^[a-z0-9][a-z0-9\s-]*$/i.test(value);
}

function includesKeyword(text: string, keyword: string) {
  const cleanKeyword = keyword.trim();

  if (!cleanKeyword) return false;

  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(cleanKeyword);

  if (isLatinKeyword(cleanKeyword)) {
    const escapedKeyword = escapeRegExp(normalizedKeyword).replace(
      /\\\s+/g,
      "\\s+"
    );

    const pattern = new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`, "i");

    return pattern.test(normalizedText);
  }

  return normalizedText.includes(normalizedKeyword);
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => includesKeyword(text, keyword));
}
}

function unique(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function getRuleMustKeywords(rule: ScoringRule) {
  const mustKeywords = rule.must_keywords ?? [];

  if (mustKeywords.length > 0) {
    return mustKeywords;
  }

  return rule.keywords ?? [];
}

function analyseArticleWithRules(
  title: string,
  summary: string | null,
  rules: ScoringRule[]
) {
  const text = `${title} ${summary ?? ""}`;

  let score = 5.0;
  let region = "全球";
  let category = "國際政治";

  const topicTags = new Set<string>();
  const domainTags = new Set<string>();
  const regionTags = new Set<string>();
  const riskTags = new Set<string>();
  const matchedRules = new Set<string>();
  const excludedRules = new Set<string>();

  const activeRules = rules
    .filter((rule) => rule.is_active)
    .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));

  for (const rule of activeRules) {
    const mustKeywords = getRuleMustKeywords(rule);
    const boostKeywords = rule.boost_keywords ?? [];
    const excludeKeywords = rule.exclude_keywords ?? [];

    if (excludeKeywords.length > 0 && includesAny(text, excludeKeywords)) {
      excludedRules.add(rule.label);
      continue;
    }

    const hasMustMatch =
      mustKeywords.length > 0 && includesAny(text, mustKeywords);

    if (!hasMustMatch) {
      continue;
    }

    const hasBoostMatch =
      boostKeywords.length > 0 && includesAny(text, boostKeywords);

    score += Number(rule.score_delta);

    if (hasBoostMatch) {
      score += 0.6;
    }

    if (rule.region) {
      region = rule.region;
      regionTags.add(rule.region);
    }

    if (rule.category) {
      category = rule.category;
      domainTags.add(rule.category);
    }

    for (const tag of rule.tags ?? []) {
      topicTags.add(tag);
    }

    for (const tag of rule.domain_tags ?? []) {
      domainTags.add(tag);
    }

    for (const tag of rule.region_tags ?? []) {
      regionTags.add(tag);
    }

    for (const tag of rule.risk_tags ?? []) {
      riskTags.add(tag);
    }

    matchedRules.add(rule.label);
  }

  return {
    score: Math.min(10, Math.round(score * 10) / 10),
    region,
    category,
    topic_tags: unique(Array.from(topicTags)),
    domain_tags: unique(Array.from(domainTags)),
    region_tags: unique(Array.from(regionTags)),
    risk_tags: unique(Array.from(riskTags)),
    matched_rules: unique(Array.from(matchedRules)),
    excluded_rules: unique(Array.from(excludedRules)),
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

async function cleanupInactiveSourceArticles(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  activeSources: Source[]
) {
  const activeSourceNames = new Set(activeSources.map((source) => source.name));

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id,source");

  if (error) {
    return {
      deleted: 0,
      error: error.message,
    };
  }

  const inactiveArticleIds =
    articles
      ?.filter((article) => !activeSourceNames.has(article.source))
      .map((article) => article.id) ?? [];

  if (inactiveArticleIds.length === 0) {
    return {
      deleted: 0,
      error: null,
    };
  }

  const { error: relationError } = await supabase
    .from("cluster_articles")
    .delete()
    .in("article_id", inactiveArticleIds);

  if (relationError) {
    return {
      deleted: 0,
      error: relationError.message,
    };
  }

  const { error: articleDeleteError } = await supabase
    .from("articles")
    .delete()
    .in("id", inactiveArticleIds);

  if (articleDeleteError) {
    return {
      deleted: 0,
      error: articleDeleteError.message,
    };
  }

  return {
    deleted: inactiveArticleIds.length,
    error: null,
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

  const { error: relationError } = await supabase
    .from("cluster_articles")
    .delete()
    .in("article_id", idsToDelete);

  if (relationError) {
    return {
      deleted: 0,
      error: relationError.message,
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

  const activeSources = (sources ?? []) as Source[];

  const cleanupResult = await cleanupInactiveSourceArticles(
    supabase,
    activeSources
  );

  const { data: scoringRules, error: rulesError } = await supabase
    .from("scoring_rules")
    .select(
      "label,keywords,must_keywords,boost_keywords,exclude_keywords,score_delta,region,category,tags,domain_tags,region_tags,risk_tags,rule_type,priority,is_active"
    )
    .eq("is_active", true);

  if (rulesError) {
    return NextResponse.json(
      { ok: false, error: rulesError.message },
      { status: 500 }
    );
  }

  let upserted = 0;
  let skipped = 0;
  let excluded = 0;
  const errors: string[] = [];

  if (cleanupResult.error) {
    errors.push(`Cleanup inactive sources: ${cleanupResult.error}`);
  }

  for (const source of activeSources) {
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

        if (analysis.excluded_rules.length > 0) {
          excluded += 1;
        }

        if (
          analysis.matched_rules.length === 0 ||
          analysis.score < MIN_ARTICLE_SCORE
        ) {
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
            domain_tags: analysis.domain_tags,
            region_tags: analysis.region_tags,
            risk_tags: analysis.risk_tags,
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
    method: "rule based article intake with domain / region / risk tags",
    upserted,
    skipped,
    excluded,
    deleted_inactive_source_articles: cleanupResult.deleted,
    deleted_old_articles: pruneResult.deleted,
    min_article_score: MIN_ARTICLE_SCORE,
    max_articles: MAX_ARTICLES,
    active_sources: activeSources.length,
    errors,
  });
}