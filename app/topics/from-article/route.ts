import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function inferRegionAndCategory(title: string, summary: string | null) {
  const text = `${title} ${summary ?? ""}`;

  if (text.includes("台灣") || text.includes("中國") || text.includes("台海")) {
    return { region: "台灣／中國", category: "台海安全" };
  }

  if (
    text.includes("美國") ||
    text.includes("中國") ||
    text.includes("晶片") ||
    text.includes("稀土")
  ) {
    return { region: "美中", category: "科技供應鏈" };
  }

  if (
    text.includes("NATO") ||
    text.includes("北約") ||
    text.includes("烏克蘭") ||
    text.includes("俄羅斯")
  ) {
    return { region: "歐洲／跨大西洋", category: "安全" };
  }

  if (
    text.includes("伊朗") ||
    text.includes("以色列") ||
    text.includes("加薩") ||
    text.includes("中東")
  ) {
    return { region: "中東", category: "軍事安全" };
  }

  if (
    text.includes("泰國") ||
    text.includes("柬埔寨") ||
    text.includes("東協") ||
    text.includes("ASEAN")
  ) {
    return { region: "東南亞", category: "區域安全" };
  }

  return { region: "全球", category: "國際政治" };
}

function makeRationale(title: string, summary: string | null) {
  return `此議題來自 RSS 新聞池，涉及「${title}」。初步摘要為：${summary ?? "尚無摘要"}。可進一步判斷其是否涉及地緣政治、安全、供應鏈、國內政治或大國競爭。`;
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

    const inferred = inferRegionAndCategory(article.title, article.summary);

    const topicPayload = {
      title: article.title,
      score: 7.5,
      region: inferred.region,
      category: inferred.category,
      rationale: makeRationale(article.title, article.summary),
      status: "new",
      tags: article.topic_tags ?? [],
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