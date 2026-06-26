import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getTopic, saveDraft } from "@/lib/db";
import { buildYardenDraftPrompt } from "@/lib/yarden-prompt";
import { Draft } from "@/lib/types";

function fallbackDraft(topicId: string): Draft {
  return {
    id: `draft-${Date.now()}`,
    topicId,
    igTitle: "🇺🇸美中關鍵資源與科技限制交鋒，談判背後仍是結構性競爭🇨🇳",
    subheadings: ["稀土成為中國談判籌碼", "EDA 與 AI 晶片限制延續", "短期降溫不代表長期競爭消失"],
    caption: "近期，美中雙方在經貿談判中針對稀土、稀土磁鐵、EDA 軟體與航空設備等限制進行協商。表面上，這是一場關於出口許可與關稅安排的技術性談判；但從更深層來看，這反映的是關鍵原物料控制權與高科技瓶頸控制權之間的結構性博弈。\n\n中國長期掌握全球稀土加工優勢，使其能在供應鏈緊張時將關鍵礦物轉化為外交與經貿籌碼。另一方面，美國則憑藉 EDA、AI 晶片與高階半導體設備的技術優勢，限制中國在先進運算與軍民兩用科技上的追趕速度。\n\n因此，即使雙方短期內透過談判降低部分限制，美中在關鍵科技與供應鏈安全上的競爭仍不會消失。值得觀察的是：中國是否會恢復出口但保留審批槓桿？美國是否會微調管制規則但維持核心限制？以及這些安排是否能轉化為更長期的貿易協議？\n\nYarden’s PORTAL 將持續追蹤相關發展，感謝您的閱讀。",
    sources: ["Reuters", "CNA", "BBC", "NYT"],
    hashtags: ["#YardenPORTAL", "#美中關係", "#稀土", "#晶片", "#供應鏈"],
    status: "draft"
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topicId = body?.topicId;

    if (!topicId || typeof topicId !== "string") {
      return NextResponse.json({ error: "Missing topicId." }, { status: 400 });
    }

    const topic = await getTopic(topicId);
    if (!topic) {
      return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    }

    let draft: Draft;

    if (!process.env.OPENAI_API_KEY) {
      draft = fallbackDraft(topic.id);
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: buildYardenDraftPrompt(topic) }],
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content ?? "{}";
      const generated = JSON.parse(content);
      draft = {
        id: `draft-${Date.now()}`,
        topicId: topic.id,
        igTitle: generated.igTitle ?? topic.title,
        subheadings: generated.subheadings ?? [],
        caption: generated.caption ?? "",
        sources: generated.sources ?? [],
        hashtags: generated.hashtags ?? [],
        status: "draft"
      };
    }

    await saveDraft(draft);
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("/api/drafts failed:", error);
    return NextResponse.json(
      {
        error: "Failed to generate draft.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
