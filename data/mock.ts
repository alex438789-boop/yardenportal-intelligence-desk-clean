import { Draft, Topic } from "@/lib/types";

export const topics: Topic[] = [
  {
    id: "us-china-rare-earth-eda",
    title: "美中稀土與 EDA 出口限制談判",
    score: 9.2,
    region: "美中",
    category: "科技供應鏈",
    rationale: "同時涉及中國稀土與磁鐵出口限制、美國 EDA 與 AI 晶片管制，以及川普政府下的關稅談判，是關鍵原物料與高科技瓶頸控制權的結構性博弈。",
    tags: ["美中競爭", "稀土", "EDA", "晶片", "供應鏈"],
    status: "selected",
    articles: [
      { id: "a1", title: "US-China trade talks make progress on rare earths and export controls", source: "Reuters", url: "https://example.com/reuters", publishedAt: "2025-06-11", summary: "雙方完成實施架構，等待兩國元首批准。" },
      { id: "a2", title: "美中倫敦經貿會談聚焦稀土與晶片限制", source: "CNA", url: "https://example.com/cna", publishedAt: "2025-06-11", summary: "談判涵蓋中國稀土出口限制與美國半導體相關出口禁令。" }
    ],
    keyQuestions: ["中國是否會恢復稀土出口但保留審批槓桿？", "美國是否會鬆動 EDA 與 AI 晶片管制？", "90 天關稅暫停是否能轉化為更長期協議？"]
  },
  {
    id: "nato-hague-defense-spending",
    title: "北約海牙峰會與 5% 軍費目標爭議",
    score: 8.9,
    region: "歐洲／跨大西洋",
    category: "安全",
    rationale: "峰會同時牽動川普第二任期下的美歐關係、烏克蘭支持、俄羅斯威脅、歐洲再武裝與各國財政承受能力。",
    tags: ["北約", "川普", "歐洲安全", "烏克蘭", "俄羅斯"],
    status: "new",
    articles: [
      { id: "a3", title: "NATO leaders debate 5 percent defense target", source: "AP", url: "https://example.com/ap", publishedAt: "2025-06-24", summary: "北約討論將國防與安全相關支出提高至 GDP 5%。" },
      { id: "a4", title: "Spain resists NATO defense spending proposal", source: "POLITICO", url: "https://example.com/politico", publishedAt: "2025-06-23", summary: "西班牙主張不需達成完整 5% 目標，引發盟國不滿。" }
    ],
    keyQuestions: ["歐洲能否在美國壓力下加速再武裝？", "烏克蘭議題是否被軍費談判遮蔽？", "西班牙等財政壓力國家的反彈會否削弱北約共識？"]
  },
  {
    id: "taiwan-grey-zone-kinmen-waters",
    title: "台海灰色地帶與金門禁限制水域爭議",
    score: 9.0,
    region: "台灣／中國",
    category: "台海安全",
    rationale: "共機共艦常態化、台海兵推、城鎮韌性演習與離島水域執法爭議共同揭示灰色地帶壓力的制度化與政治化。",
    tags: ["台海", "金門", "灰色地帶", "海巡", "全民防衛"],
    status: "drafted",
    articles: [
      { id: "a5", title: "Taiwan reports unusual pause in PLA aircraft activity", source: "CNA", url: "https://example.com/cna2", publishedAt: "2025-06-14", summary: "共機罕見兩日未進入台灣應變區，但共艦仍在周邊活動。" },
      { id: "a6", title: "Kinmen restricted waters dispute resurfaces", source: "VOA", url: "https://example.com/voa", publishedAt: "2025-06-01", summary: "中國海警進入離島水域逐漸常態化，引發執法與主權論辯。" }
    ],
    keyQuestions: ["灰色地帶行動是否正在改變台海日常安全秩序？", "金馬水域執法是否會成為兩岸新摩擦點？", "中東戰爭風險是否可能牽動台海判斷？"]
  }
];

export const drafts: Draft[] = [
  {
    id: "d1",
    topicId: "taiwan-grey-zone-kinmen-waters",
    igTitle: "✈️共機罕見兩日未擾台，兩岸軍事壓力未見降溫💥",
    subheadings: ["台海軍事壓力仍未消失", "兵推揭示東部登陸風險", "離島水域執法爭議升溫"],
    caption: "近期台海及全球局勢持續緊張，台灣社群媒體上關於戰時物資準備的文章廣為流傳……\n\n以上為示範草稿。正式版本應由你人工查證與修訂。",
    sources: ["CNA", "BBC", "PTS", "VOA"],
    hashtags: ["#YardenPORTAL", "#台海", "#國際關係", "#灰色地帶"],
    status: "draft"
  }
];
