import { Topic } from "@/lib/types";

export function buildYardenDraftPrompt(topic: Topic) {
  return `你是 YardenPORTAL 的國際議題分析助理。請根據以下議題與來源資料，生成一篇繁體中文 IG caption 草稿。

議題：${topic.title}
區域：${topic.region}
類型：${topic.category}
推薦理由：${topic.rationale}

相關來源：
${topic.articles.map((a) => `- ${a.source}: ${a.title}。摘要：${a.summary}`).join("\n")}

寫作要求：
1. 以新聞事件為起點。
2. 補充歷史、制度、法律或地理背景。
3. 至少分析兩個層次：國內政治、區域安全、大國競爭、供應鏈或國際制度。
4. 避免誇大戰爭風險，不要斷言必然開戰。
5. 結尾提出 2–3 個值得觀察的問題。
6. 語氣介於新聞解釋、國際關係分析與公共知識推廣之間。
7. 請輸出 JSON，格式為：
{
  "igTitle": "...",
  "subheadings": ["...", "...", "..."],
  "caption": "...",
  "sources": ["..."],
  "hashtags": ["..."]
}`;
}
