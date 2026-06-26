import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ScoringRule = {
  label: string;
  keywords: string[];
  score_delta: number | string;
  region: string | null;
  category: string | null;
  tags: string[] | null;
  is_active: boolean;
};

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
  const tags = new Set<string>();

  for (const rule of rules) {
    if (!rule.is_active) continue;

    if (includesAny(text, rule.keywords ?? [])) {
      score += Number(rule.score_delta);

      if (rule.region) region = rule.region;
      if (rule.category) category = rule.category;

      for (const tag of rule.tags ?? []) {
        tags.add(tag);
      }
    }
  }

  return {
    score: Math.min(10, Math.round(score * 10) / 10),
    region,
    category,
    tags: Array.from(tags),
  };
}

function makeRationale(title: string, summary: string | null) {
  return `此議題來自 RSS 新聞池，涉及「${title}」。初步摘要為：${
    summary ?? "尚無摘要"
  }。可進一步判斷其是否涉及地緣政治、安全、供應鏈、國內政治或大國競爭。`;
}

export async function POST(request: Request) {
  try {
    const { articleId } = await request.json();

    if (!articleId) {
      return NextResponse.json(
        { ok: false, error: "Missing articleId" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      return NextResponse.json(
        {
          ok: false,
          error: articleError?.message ?? "Article not found",
        },
        { status: 404 }
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

    const analysis = analyseArticleWithRules(
      article.title,
      article.summary,
      scoringRules ?? []
    );

    const topicPayload = {
      title: article.title,
      score: analysis.score,
      region: analysis.region,
      category: analysis.category,
      rationale: makeRationale(article.title, article.summary),
      status: "new",
      tags: Array.from(
        new Set([...(article.topic_tags ?? []), ...analysis.tags])
      ),
      articles: [
        {
          id: article.id,
          title: article.title,
          source: article.source,
          url: article.url,
          publishedAt: article.published_at,
          summary: article.summary,
        },
      ],
      key_questions: [
        "此事件是否代表政策或安全局勢的轉折？",
        "主要行為者的國內政治考量是什麼？",
        "這件事是否會牽動區域安全或大國競爭？",
      ],
    };

    const { data: topic, error: insertError } = await supabase
      .from("topics")
      .insert(topicPayload)
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, topic });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}