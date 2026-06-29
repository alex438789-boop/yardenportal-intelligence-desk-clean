import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* ============================================================================
 * 1. Types
 * ========================================================================== */

type Article = {
  id: string;
  title: string;
  source: string;
  url: string;
  published_at: string | null;
  summary: string | null;
  score: number | string | null;
  region: string | null;
  category: string | null;
  topic_tags: string[] | null;
  matched_rules: string[] | null;
  event_fingerprint: string | null;
  event_keywords: string[] | null;
};

type EventSignal = {
  entities: string[];
  actions: string[];
  topics: string[];
  all: string[];
};

type ClusterDraft = {
  title: string;
  summary: string;
  score: number;
  region: string | null;
  category: string | null;
  tags: string[];
  matched_rules: string[];
  event_keywords: string[];
  event_fingerprint: string | null;
  articles: Article[];
};

type EventType =
  | "military_conflict"
  | "export_control"
  | "tech_investment"
  | "nuclear_diplomacy"
  | "election"
  | "government_formation"
  | "polling"
  | "trade_policy"
  | "diplomacy"
  | "energy"
  | "climate_policy"
  | "unknown";

type GeneratedClusterText = {

  title: string;

  summary: string;

  source: "gemini" | "fallback";

};

/* ============================================================================
 * 2. Core settings
 * ========================================================================== */

const MAX_ARTICLES = 100;
const TIME_WINDOW_HOURS = 72;
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_GEMINI_ARTICLES_PER_CLUSTER = 8;
const MAX_GEMINI_CLUSTERS_PER_REBUILD = 20;
const GEMINI_TIMEOUT_MS = 12000;

/* ============================================================================
 * 3. Generic filters
 * ========================================================================== */

const BROAD_CLUSTER_TERMS = new Set([
  "美中競爭",
  "供應鏈",
  "軍事安全",
  "中東",
  "台灣政治",
  "國內政治",
  "歐洲安全",
  "北約",
  "台海",
  "臺海",
  "灰色地帶",
  "東南亞",
  "區域安全",
  "科技供應鏈",
  "國際政治",
  "安全",
  "台美關係",
  "國會外交",
  "全球",
  "國際",
  "中國",
  "美國",
  "台灣",
  "臺灣",
  "china",
  "united states",
  "u.s.",
  "us",
  "taiwan",
]);

const STOP_WORDS = new Set([
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
  "今天",
  "昨日",
  "明日",
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
  "after",
  "before",
  "over",
  "into",
  "about",
  "more",
  "than",
  "its",
  "his",
  "her",
  "their",
  "they",
  "them",
  "who",
  "what",
  "when",
  "where",
  "why",
]);

const WEAK_ENTITIES = new Set([
  "中國",
  "美國",
  "台灣",
  "臺灣",
  "日本",
  "韓國",
  "北韓",
  "歐盟",
  "歐洲",
  "中東",
  "東南亞",
  "全球",
  "國際",
  "北京",
  "東京",
  "首爾",
  "台北",
  "華府",
]);

const SOURCE_ARTIFACT_TERMS = new Set([
  "google",
  "news",
  "reuters",
  "feed",
  "rss",
  "middle",
  "east",
  "world",
  "technology",
  "security",
  "politics",
  "latest",
]);

const SPECIFIC_ANCHOR_ACTIONS = new Set([
  "出口管制",
  "科技管制",
  "制裁",
  "關稅",
  "禁令",
  "限制",
  "查扣",
  "海關查扣",
  "攻擊",
  "空襲",
  "轟炸",
  "停火",
  "封鎖",
  "軍演",
  "巡邏",
  "部署",
  "發射",
  "投資",
  "建設",
  "擴張",
  "設廠",
  "擴廠",
  "選舉",
  "表決",
  "罷免",
  "不信任投票",
]);

const SPECIFIC_POLICY_TOPICS = new Set([
  "半導體",
  "晶片",
  "先進晶片",
  "AI晶片",
  "人工智慧",
  "生成式AI",
  "資料中心",
  "GPU",
  "高頻寬記憶體",
  "出口管制",
  "科技管制",
  "產業政策",
  "國防預算",
  "軍費",
  "飛彈",
  "無人機",
  "網路安全",
  "制裁",
  "關稅",
  "能源",
  "石油",
  "天然氣",
  "核電",
]);

function isWeakEntity(value: string) {
  return WEAK_ENTITIES.has(value);
}

function getStrongItems(values: string[]) {
  return values.filter((value) => !isWeakEntity(value));
}

function getSpecificTopicItems(values: string[]) {
  return values.filter((value) => SPECIFIC_POLICY_TOPICS.has(value));
}

function getSpecificActionItems(values: string[]) {
  return values.filter((value) => SPECIFIC_ANCHOR_ACTIONS.has(value));
}

/* ============================================================================
 * 4. Alias taxonomy
 * ========================================================================== */

const PERSON_ALIASES: [string, string][] = [
  ["donald trump", "川普"],
  ["trump", "川普"],
  ["jd vance", "范斯"],
  ["j.d. vance", "范斯"],
  ["vance", "范斯"],
  ["joe biden", "拜登"],
  ["biden", "拜登"],
  ["xi jinping", "習近平"],
  ["xi", "習近平"],
  ["lai ching-te", "賴清德"],
  ["lai ching te", "賴清德"],
  ["william lai", "賴清德"],
  ["han kuo-yu", "韓國瑜"],
  ["han kuo yu", "韓國瑜"],
  ["ko wen-je", "柯文哲"],
  ["ko wen je", "柯文哲"],
  ["huang kuo-chang", "黃國昌"],
  ["huang kuo chang", "黃國昌"],
  ["ma ying-jeou", "馬英九"],
  ["ma ying jeou", "馬英九"],
  ["vladimir putin", "普丁"],
  ["putin", "普丁"],
  ["volodymyr zelenskyy", "澤倫斯基"],
  ["zelenskyy", "澤倫斯基"],
  ["zelensky", "澤倫斯基"],
  ["benjamin netanyahu", "內塔尼亞胡"],
  ["netanyahu", "內塔尼亞胡"],
  ["ali khamenei", "哈梅內伊"],
  ["khamenei", "哈梅內伊"],
  ["emmanuel macron", "馬克宏"],
  ["macron", "馬克宏"],
];

const GOVERNMENT_AND_ORG_ALIASES: [string, string][] = [
  ["white house", "白宮"],
  ["state department", "國務院"],
  ["u.s. state department", "國務院"],
  ["us state department", "國務院"],
  ["pentagon", "五角大廈"],
  ["u.s. congress", "美國國會"],
  ["us congress", "美國國會"],
  ["congress", "美國國會"],
  ["senate", "美國參議院"],
  ["house of representatives", "美國眾議院"],
  ["federal reserve", "聯準會"],
  ["fed", "聯準會"],
  ["treasury department", "美國財政部"],
  ["department of defense", "美國國防部"],
  ["ministry of national defense", "國防部"],
  ["mainland affairs council", "陸委會"],
  ["legislative yuan", "立法院"],
  ["executive yuan", "行政院"],
  ["presidential office", "總統府"],
  ["kuomintang", "國民黨"],
  ["kmt", "國民黨"],
  ["democratic progressive party", "民進黨"],
  ["dpp", "民進黨"],
  ["taiwan people's party", "民眾黨"],
  ["tpp", "民眾黨"],
  ["nato", "北約"],
  ["north atlantic treaty organization", "北約"],
  ["european union", "歐盟"],
  ["eu", "歐盟"],
  ["european parliament", "歐洲議會"],
  ["united nations", "聯合國"],
  ["un", "聯合國"],
  ["security council", "安理會"],
  ["world trade organization", "世貿組織"],
  ["wto", "世貿組織"],
  ["who", "WHO"],
  ["imf", "IMF"],
  ["world bank", "世界銀行"],
  ["international court of justice", "國際法院"],
  ["icj", "國際法院"],
  ["international criminal court", "國際刑事法院"],
  ["icc", "國際刑事法院"],
];

const COUNTRY_AND_PLACE_ALIASES: [string, string][] = [
  ["china", "中國"],
  ["people's republic of china", "中國"],
  ["mainland china", "中國"],
  ["prc", "中國"],
  ["beijing", "北京"],
  ["taiwan", "台灣"],
  ["taipei", "台北"],
  ["republic of china", "中華民國"],
  ["roc", "中華民國"],
  ["united states", "美國"],
  ["u.s.", "美國"],
  ["us", "美國"],
  ["america", "美國"],
  ["japan", "日本"],
  ["tokyo", "東京"],
  ["south korea", "韓國"],
  ["south korean", "韓國"],
  ["korea", "韓國"],
  ["seoul", "首爾"],
  ["north korea", "北韓"],
  ["philippines", "菲律賓"],
  ["vietnam", "越南"],
  ["india", "印度"],
  ["indonesia", "印尼"],
  ["myanmar", "緬甸"],
  ["thailand", "泰國"],
  ["singapore", "新加坡"],
  ["australia", "澳洲"],
  ["uk", "英國"],
  ["britain", "英國"],
  ["france", "法國"],
  ["germany", "德國"],
  ["italy", "義大利"],
  ["turkey", "土耳其"],
  ["türkiye", "土耳其"],
  ["iran", "伊朗"],
  ["israel", "以色列"],
  ["gaza", "加薩"],
  ["hamas", "哈瑪斯"],
  ["hezbollah", "真主黨"],
  ["houthis", "胡塞"],
  ["ukraine", "烏克蘭"],
  ["russia", "俄羅斯"],
  ["qatar", "卡達"],
  ["saudi arabia", "沙烏地"],
  ["netherlands", "荷蘭"],
  ["dutch", "荷蘭"],
  ["brussels", "布魯塞爾"],
  ["taiwan strait", "台海"],
  ["south china sea", "南海"],
  ["east china sea", "東海"],
  ["red sea", "紅海"],
  ["black sea", "黑海"],
];

const SEMICONDUCTOR_AND_AI_ALIASES: [string, string][] = [
  ["ai", "人工智慧"],
  ["artificial intelligence", "人工智慧"],
  ["generative ai", "生成式AI"],
  ["genai", "生成式AI"],
  ["large language model", "大型語言模型"],
  ["large language models", "大型語言模型"],
  ["llm", "大型語言模型"],
  ["llms", "大型語言模型"],
  ["data center", "資料中心"],
  ["data centers", "資料中心"],
  ["datacenter", "資料中心"],
  ["datacenters", "資料中心"],
  ["gpu", "GPU"],
  ["gpus", "GPU"],
  ["accelerator", "AI加速器"],
  ["accelerators", "AI加速器"],
  ["semiconductor", "半導體"],
  ["semiconductors", "半導體"],
  ["chip", "晶片"],
  ["chips", "晶片"],
  ["advanced chip", "先進晶片"],
  ["advanced chips", "先進晶片"],
  ["ai chip", "AI晶片"],
  ["ai chips", "AI晶片"],
  ["memory chip", "記憶體晶片"],
  ["memory chips", "記憶體晶片"],
  ["hbm", "高頻寬記憶體"],
  ["high bandwidth memory", "高頻寬記憶體"],
  ["wafer", "晶圓"],
  ["wafers", "晶圓"],
  ["foundry", "晶圓代工"],
  ["foundries", "晶圓代工"],
  ["fab", "晶圓廠"],
  ["fabs", "晶圓廠"],
  ["lithography", "微影"],
  ["euv", "EUV"],
  ["tsmc", "台積電"],
  ["taiwan semiconductor", "台積電"],
  ["taiwan semiconductor manufacturing", "台積電"],
  ["nvidia", "輝達"],
  ["nvda", "輝達"],
  ["amd", "超微"],
  ["advanced micro devices", "超微"],
  ["intel", "英特爾"],
  ["samsung", "三星"],
  ["samsung electronics", "三星"],
  ["sk hynix", "SK海力士"],
  ["sk", "SK"],
  ["asml", "艾司摩爾"],
  ["smic", "中芯國際"],
  ["semiconductor manufacturing international", "中芯國際"],
  ["huawei", "華為"],
  ["micron", "美光"],
  ["broadcom", "博通"],
  ["qualcomm", "高通"],
  ["arm", "ARM"],
  ["softbank", "軟銀"],
  ["openai", "OpenAI"],
  ["microsoft", "微軟"],
  ["google", "Google"],
  ["alphabet", "Google"],
  ["amazon", "亞馬遜"],
  ["aws", "亞馬遜雲端"],
  ["meta", "Meta"],
  ["apple", "蘋果"],
  ["oracle", "甲骨文"],
  ["tesla", "特斯拉"],
  ["xai", "xAI"],
  ["anthropic", "Anthropic"],
];

const ACTION_ALIASES: [string, string][] = [
  ["visit", "訪問"],
  ["visits", "訪問"],
  ["visited", "訪問"],
  ["visiting", "訪問"],
  ["delegation", "訪團"],
  ["congressional delegation", "國會訪團"],
  ["meet", "會晤"],
  ["meets", "會晤"],
  ["met", "會晤"],
  ["meeting", "會晤"],
  ["talk", "會談"],
  ["talks", "會談"],
  ["call", "通話"],
  ["calls", "通話"],
  ["announce", "宣布"],
  ["announces", "宣布"],
  ["announced", "宣布"],
  ["unveil", "推出"],
  ["launch", "推出"],
  ["pledge", "承諾"],
  ["build", "建設"],
  ["expand", "擴張"],
  ["warning", "警告"],
  ["warn", "警告"],
  ["warns", "警告"],
  ["warned", "警告"],
  ["condemn", "譴責"],
  ["condemns", "譴責"],
  ["condemned", "譴責"],
  ["sanction", "制裁"],
  ["sanctions", "制裁"],
  ["sanctioned", "制裁"],
  ["tariff", "關稅"],
  ["tariffs", "關稅"],
  ["restriction", "限制"],
  ["restrictions", "限制"],
  ["ban", "禁令"],
  ["subsidy", "補貼"],
  ["subsidies", "補貼"],
  ["export control", "出口管制"],
  ["export controls", "出口管制"],
  ["technology control", "科技管制"],
  ["technology controls", "科技管制"],
  ["industrial policy", "產業政策"],
  ["supply chain", "供應鏈"],
  ["investment", "投資"],
  ["investment drive", "投資"],
  ["ceasefire", "停火"],
  ["cease-fire", "停火"],
  ["attack", "攻擊"],
  ["attacks", "攻擊"],
  ["attacked", "攻擊"],
  ["strike", "攻擊"],
  ["strikes", "攻擊"],
  ["struck", "攻擊"],
  ["airstrike", "空襲"],
  ["airstrikes", "空襲"],
  ["bombing", "轟炸"],
  ["blockade", "封鎖"],
  ["deploy", "部署"],
  ["deploys", "部署"],
  ["deployed", "部署"],
  ["deployment", "部署"],
  ["exercise", "軍演"],
  ["exercises", "軍演"],
  ["drill", "軍演"],
  ["drills", "軍演"],
  ["patrol", "巡邏"],
  ["patrols", "巡邏"],
  ["launches", "發射"],
  ["launched", "發射"],
  ["pass", "通過"],
  ["passes", "通過"],
  ["passed", "通過"],
  ["vote", "表決"],
  ["votes", "表決"],
  ["voted", "表決"],
  ["reject", "否決"],
  ["rejects", "否決"],
  ["rejected", "否決"],
  ["investigate", "調查"],
  ["investigates", "調查"],
  ["investigated", "調查"],
  ["arrest", "逮捕"],
  ["arrests", "逮捕"],
  ["arrested", "逮捕"],
  ["election", "選舉"],
  ["elections", "選舉"],
  ["recall", "罷免"],
  ["protest", "抗議"],
  ["protests", "抗議"],
  ["summit", "峰會"],
  ["seize", "查扣"],
  ["customs seizes", "海關查扣"],
];

const RESOURCE_AND_POLICY_ALIASES: [string, string][] = [
  ["rare earth", "稀土"],
  ["rare earths", "稀土"],
  ["critical minerals", "關鍵礦物"],
  ["energy", "能源"],
  ["natural gas", "天然氣"],
  ["oil", "石油"],
  ["nuclear", "核電"],
  ["renewable energy", "再生能源"],
  ["defense spending", "軍費"],
  ["defence spending", "軍費"],
  ["defense budget", "國防預算"],
  ["defence budget", "國防預算"],
  ["missile", "飛彈"],
  ["missiles", "飛彈"],
  ["drone", "無人機"],
  ["drones", "無人機"],
  ["warship", "軍艦"],
  ["warships", "軍艦"],
  ["aircraft", "軍機"],
  ["carrier", "航母"],
  ["submarine", "潛艦"],
  ["cybersecurity", "網路安全"],
  ["cyber security", "網路安全"],
  ["disinformation", "假訊息"],
  ["digital sovereignty", "數位主權"],
  ["immigration", "移民"],
  ["refugee", "難民"],
  ["refugees", "難民"],
  ["border", "邊境"],
  ["trade", "貿易"],
  ["inflation", "通膨"],
  ["interest rate", "利率"],
  ["interest rates", "利率"],
];

const ALIAS_ENTRIES: [string, string][] = [
  ...PERSON_ALIASES,
  ...GOVERNMENT_AND_ORG_ALIASES,
  ...COUNTRY_AND_PLACE_ALIASES,
  ...SEMICONDUCTOR_AND_AI_ALIASES,
  ...ACTION_ALIASES,
  ...RESOURCE_AND_POLICY_ALIASES,
];

const ALIAS_MAP: Record<string, string> = Object.fromEntries(
  ALIAS_ENTRIES.map(([alias, canonical]) => [
    alias.trim().toLowerCase(),
    canonical,
  ])
);

/* ============================================================================
 * 5. Signal dictionaries
 * ========================================================================== */

const KNOWN_ENTITIES = [
  "川普",
  "拜登",
  "范斯",
  "布林肯",
  "盧比歐",
  "貝森特",
  "鮑爾",
  "習近平",
  "李強",
  "王毅",
  "賴清德",
  "蕭美琴",
  "卓榮泰",
  "韓國瑜",
  "朱立倫",
  "柯文哲",
  "黃國昌",
  "馬英九",
  "石破茂",
  "尹錫悅",
  "李在明",
  "普丁",
  "澤倫斯基",
  "內塔尼亞胡",
  "哈梅內伊",
  "馬克宏",
  "梅洛尼",
  "馮德萊恩",
  "美國國會",
  "美國參議院",
  "美國眾議院",
  "白宮",
  "國務院",
  "五角大廈",
  "美國財政部",
  "美國國防部",
  "聯準會",
  "中國外交部",
  "國台辦",
  "解放軍",
  "海警",
  "國防部",
  "外交部",
  "陸委會",
  "行政院",
  "立法院",
  "總統府",
  "國民黨",
  "民進黨",
  "民眾黨",
  "歐盟",
  "歐洲議會",
  "北約",
  "聯合國",
  "安理會",
  "國際法院",
  "國際刑事法院",
  "世貿組織",
  "WTO",
  "WHO",
  "IMF",
  "世界銀行",
  "中國",
  "美國",
  "台灣",
  "台北",
  "北京",
  "日本",
  "東京",
  "韓國",
  "首爾",
  "北韓",
  "菲律賓",
  "越南",
  "印度",
  "印尼",
  "緬甸",
  "泰國",
  "新加坡",
  "澳洲",
  "英國",
  "法國",
  "德國",
  "義大利",
  "土耳其",
  "沙烏地",
  "卡達",
  "荷蘭",
  "布魯塞爾",
  "金門",
  "馬祖",
  "台海",
  "臺海",
  "南海",
  "東海",
  "紅海",
  "黑海",
  "伊朗",
  "以色列",
  "加薩",
  "哈瑪斯",
  "真主黨",
  "胡塞",
  "烏克蘭",
  "俄羅斯",
  "台積電",
  "輝達",
  "超微",
  "英特爾",
  "三星",
  "SK",
  "SK海力士",
  "艾司摩爾",
  "ASML",
  "中芯國際",
  "華為",
  "美光",
  "博通",
  "高通",
  "ARM",
  "軟銀",
  "OpenAI",
  "微軟",
  "Google",
  "亞馬遜",
  "亞馬遜雲端",
  "Meta",
  "蘋果",
  "甲骨文",
  "特斯拉",
  "xAI",
  "Anthropic",
];

const ACTION_TERMS = [
  "訪問",
  "訪台",
  "訪美",
  "訪團",
  "國會訪團",
  "接待",
  "會晤",
  "會談",
  "通話",
  "聲明",
  "宣布",
  "推出",
  "警告",
  "譴責",
  "談判",
  "協議",
  "通過",
  "表決",
  "否決",
  "修法",
  "預算",
  "選舉",
  "罷免",
  "起訴",
  "判決",
  "調查",
  "洩密",
  "逮捕",
  "釋放",
  "抗議",
  "示威",
  "峰會",
  "制裁",
  "反制",
  "封鎖",
  "禁運",
  "出口管制",
  "科技管制",
  "關稅",
  "停火",
  "開火",
  "空襲",
  "攻擊",
  "轟炸",
  "攔截",
  "軍演",
  "巡航",
  "巡邏",
  "部署",
  "增兵",
  "撤軍",
  "發射",
  "入侵",
  "衝突",
  "限制",
  "禁令",
  "補貼",
  "投資",
  "承諾",
  "建設",
  "擴張",
  "查扣",
  "海關查扣",
  "合作",
  "聯手",
  "供應",
  "採購",
  "生產",
  "量產",
  "研發",
  "設廠",
  "擴廠",
];

const POLICY_TOPICS = [
  "人工智慧",
  "生成式AI",
  "大型語言模型",
  "資料中心",
  "GPU",
  "AI加速器",
  "半導體",
  "晶片",
  "先進晶片",
  "AI晶片",
  "記憶體晶片",
  "高頻寬記憶體",
  "晶圓",
  "晶圓代工",
  "晶圓廠",
  "EUV",
  "微影",
  "出口管制",
  "科技管制",
  "產業政策",
  "科技供應鏈",
  "經濟安全",
  "AI基礎設施",
  "稀土",
  "關鍵礦物",
  "供應鏈",
  "能源",
  "天然氣",
  "石油",
  "核電",
  "再生能源",
  "碳費",
  "碳稅",
  "淨零",
  "永續",
  "ESG",
  "貿易",
  "投資",
  "匯率",
  "通膨",
  "利率",
  "制裁",
  "關稅",
  "補貼",
  "國防預算",
  "軍費",
  "飛彈",
  "無人機",
  "軍機",
  "軍艦",
  "航母",
  "潛艦",
  "防空",
  "網路安全",
  "資安",
  "假訊息",
  "認知作戰",
  "數位主權",
  "移民",
  "難民",
  "邊境",
];

/* ============================================================================
 * 6. Event type rules
 * ========================================================================== */

const EVENT_TYPE_RULES: { type: EventType; terms: string[] }[] = [
  {
    type: "military_conflict",
    terms: [
      "攻擊",
      "空襲",
      "轟炸",
      "飛彈",
      "軍演",
      "巡邏",
      "部署",
      "封鎖",
      "停火",
      "戰爭",
      "衝突",
      "attack",
      "strike",
      "airstrike",
      "missile",
      "ceasefire",
      "war",
    ],
  },
  {
    type: "export_control",
    terms: [
      "出口管制",
      "科技管制",
      "制裁",
      "禁令",
      "限制",
      "dual-use",
      "export control",
      "sanction",
      "restriction",
      "ban",
    ],
  },
  {
    type: "tech_investment",
    terms: [
      "半導體",
      "晶片",
      "人工智慧",
      "AI晶片",
      "資料中心",
      "投資",
      "設廠",
      "擴廠",
      "建設",
      "semiconductor",
      "chip",
      "AI",
      "investment",
      "data center",
      "fab",
    ],
  },
  {
    type: "nuclear_diplomacy",
    terms: [
      "核",
      "核查",
      "IAEA",
      "核協議",
      "鈾",
      "nuclear",
      "inspectors",
      "uranium",
    ],
  },
  {
    type: "election",
    terms: [
      "選舉",
      "大選",
      "投票",
      "決選",
      "election",
      "vote",
      "ballot",
      "runoff",
    ],
  },
  {
    type: "government_formation",
    terms: [
      "組閣",
      "聯合政府",
      "少數政府",
      "內閣",
      "不信任投票",
      "government formation",
      "coalition government",
      "minority government",
      "cabinet",
      "no-confidence",
    ],
  },
  {
    type: "polling",
    terms: [
      "民調",
      "支持率",
      "approval rating",
      "poll",
      "polling",
      "survey",
    ],
  },
  {
    type: "trade_policy",
    terms: [
      "關稅",
      "貿易",
      "供應鏈",
      "補貼",
      "產業政策",
      "tariff",
      "trade",
      "supply chain",
      "subsidy",
      "industrial policy",
    ],
  },
  {
    type: "diplomacy",
    terms: [
      "訪問",
      "會晤",
      "會談",
      "峰會",
      "協議",
      "談判",
      "visit",
      "meet",
      "talks",
      "summit",
      "agreement",
      "negotiation",
    ],
  },
  {
    type: "energy",
    terms: [
      "能源",
      "石油",
      "天然氣",
      "核電",
      "oil",
      "gas",
      "energy",
      "nuclear power",
    ],
  },
  {
    type: "climate_policy",
    terms: [
      "氣候",
      "碳",
      "淨零",
      "ESG",
      "CBAM",
      "永續",
      "climate",
      "carbon",
      "net zero",
      "sustainable finance",
    ],
  },
];

/* ============================================================================
 * 7. Utility functions
 * ========================================================================== */

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 5.5;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 5.5 : numberValue;
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

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function cleanToken(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLatinKeyword(value: string) {
  return /^[a-z0-9][a-z0-9\s.-]*$/i.test(value);
}

function includesTerm(text: string, term: string) {
  const cleanTerm = term.trim();

  if (!cleanTerm) return false;

  if (isLatinKeyword(cleanTerm)) {
    const escapedTerm = escapeRegExp(cleanTerm.toLowerCase()).replace(
      /\\\s+/g,
      "\\s+"
    );

    const pattern = new RegExp(
      `(^|[^a-z0-9])${escapedTerm}([^a-z0-9]|$)`,
      "i"
    );

    return pattern.test(text.toLowerCase());
  }

  return text.includes(cleanTerm);
}

function normalizeAlias(value: string) {
  const normalized = normalize(value);
  return ALIAS_MAP[normalized] ?? value;
}

function normalizeAliasList(values: string[]) {
  return unique(values.map((value) => normalizeAlias(value)));
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) return "";

  const clean = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

/* ============================================================================
 * 8. Event type detection
 * ========================================================================== */

function detectEventTypesFromText(text: string): EventType[] {
  const types = EVENT_TYPE_RULES.filter((rule) =>
    rule.terms.some((term) => includesTerm(text, term))
  ).map((rule) => rule.type);

  return Array.from(new Set(types));
}

function getArticleEventTypes(article: Article): EventType[] {
  const text = [
    article.title,
    article.summary,
    article.region,
    article.category,
    ...(article.topic_tags ?? []),
    ...(article.matched_rules ?? []),
    ...(article.event_keywords ?? []),
  ].join(" ");

  const types = detectEventTypesFromText(text);

  return types.length > 0 ? types : ["unknown"];
}

function getClusterEventTypes(cluster: ClusterDraft): EventType[] {
  const types = Array.from(
    new Set(cluster.articles.flatMap((article) => getArticleEventTypes(article)))
  );

  return types.length > 0 ? types : ["unknown"];
}

function areEventTypesCompatible(article: Article, cluster: ClusterDraft) {
  const articleTypes = getArticleEventTypes(article);
  const clusterTypes = getClusterEventTypes(cluster);

  if (articleTypes.includes("unknown") || clusterTypes.includes("unknown")) {
    return true;
  }

  const directOverlap = articleTypes.some((type) => clusterTypes.includes(type));

  if (directOverlap) return true;

  const compatiblePairs = new Set([
    "export_control|trade_policy",
    "trade_policy|export_control",
    "export_control|tech_investment",
    "tech_investment|export_control",
    "tech_investment|trade_policy",
    "trade_policy|tech_investment",
    "election|government_formation",
    "government_formation|election",
    "election|polling",
    "polling|election",
    "government_formation|polling",
    "polling|government_formation",
    "nuclear_diplomacy|diplomacy",
    "diplomacy|nuclear_diplomacy",
    "military_conflict|diplomacy",
    "diplomacy|military_conflict",
  ]);

  return articleTypes.some((articleType) =>
    clusterTypes.some((clusterType) =>
      compatiblePairs.has(`${articleType}|${clusterType}`)
    )
  );
}

/* ============================================================================
 * 9. Signal extraction
 * ========================================================================== */

function extractAliases(text: string) {
  return unique(
    Object.entries(ALIAS_MAP)
      .filter(([alias]) => includesTerm(text, alias))
      .map(([, canonical]) => canonical)
  );
}

function extractKnownTerms(text: string, dictionary: string[]) {
  return unique(dictionary.filter((term) => includesTerm(text, term)));
}

function fallbackTokens(text: string) {
  const normalizedText = text
    .replace(/[，。！？、；：「」『』（）()【】\[\],.!?:;"'“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const latinWords = normalizedText.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];
  const chineseChunks = normalizedText.match(/[\u4e00-\u9fff]{3,}/g) ?? [];

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

  return normalizeAliasList(
    unique([...latinWords, ...chineseTokens])
      .map(cleanToken)
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
      .filter((token) => !STOP_WORDS.has(normalize(token)))
      .filter((token) => !BROAD_CLUSTER_TERMS.has(token))
      .filter((token) => !SOURCE_ARTIFACT_TERMS.has(normalize(token)))
      .slice(0, 20)
  );
}

function getEventSignal(article: Article): EventSignal {
  const text = `${article.title} ${article.summary ?? ""}`;

  const aliasSignals = extractAliases(text);
  const knownEntities = extractKnownTerms(text, KNOWN_ENTITIES);
  const actions = extractKnownTerms(text, ACTION_TERMS);
  const policyTopics = extractKnownTerms(text, POLICY_TOPICS);

  const storedKeywords = normalizeAliasList(
    (article.event_keywords ?? [])
      .map(cleanToken)
      .filter((keyword) => keyword.length >= 3)
      .filter((keyword) => !STOP_WORDS.has(keyword))
      .filter((keyword) => !STOP_WORDS.has(normalize(keyword)))
      .filter((keyword) => !BROAD_CLUSTER_TERMS.has(keyword))
      .filter((keyword) => !SOURCE_ARTIFACT_TERMS.has(normalize(keyword)))
  );

  const fallback = fallbackTokens(text);

  const entities = unique([
    ...knownEntities,
    ...aliasSignals.filter((item) => KNOWN_ENTITIES.includes(item)),
  ]);

  const eventActions = unique([
    ...actions,
    ...aliasSignals.filter((item) => ACTION_TERMS.includes(item)),
  ]);

  const topics = unique([
    ...policyTopics,
    ...aliasSignals.filter((item) => POLICY_TOPICS.includes(item)),
  ]);

  const all = unique([
    ...entities,
    ...eventActions,
    ...topics,
    ...aliasSignals,
    ...storedKeywords,
    ...fallback,
  ])
    .filter((item) => !BROAD_CLUSTER_TERMS.has(item))
    .filter((item) => !SOURCE_ARTIFACT_TERMS.has(normalize(item)));

  return {
    entities,
    actions: eventActions,
    topics,
    all,
  };
}

/* ============================================================================
 * 10. Cluster scoring logic
 * ========================================================================== */

function overlapItems(a: string[], b: string[]) {
  const setB = new Set(b.map((item) => normalize(item)));

  return a.filter((item) => setB.has(normalize(item)));
}

function getClusterSignals(cluster: ClusterDraft): EventSignal {
  const signals = cluster.articles.map((article) => getEventSignal(article));

  return {
    entities: unique(signals.flatMap((signal) => signal.entities)),
    actions: unique(signals.flatMap((signal) => signal.actions)),
    topics: unique(signals.flatMap((signal) => signal.topics)),
    all: unique(signals.flatMap((signal) => signal.all)),
  };
}

function isWithinTimeWindow(article: Article, cluster: ClusterDraft) {
  const articleTime = article.published_at
    ? new Date(article.published_at).getTime()
    : null;

  const clusterTimes = cluster.articles
    .map((item) =>
      item.published_at ? new Date(item.published_at).getTime() : null
    )
    .filter((value): value is number => value !== null);

  if (!articleTime || clusterTimes.length === 0) return true;

  const latestClusterTime = Math.max(...clusterTimes);
  const diffHours = Math.abs(articleTime - latestClusterTime) / 1000 / 60 / 60;

  return diffHours <= TIME_WINDOW_HOURS;
}

function hasContradictoryRegion(article: Article, cluster: ClusterDraft) {
  if (!article.region || !cluster.region) return false;

  const broadRegions = new Set(["全球", "國際", "國際政治", "美中"]);

  if (broadRegions.has(article.region) || broadRegions.has(cluster.region)) {
    return false;
  }

  return article.region !== cluster.region;
}

function getSpecificOverlap(article: Article, cluster: ClusterDraft) {
  const articleSignal = getEventSignal(article);
  const clusterSignal = getClusterSignals(cluster);

  const entityOverlap = overlapItems(
    articleSignal.entities,
    clusterSignal.entities
  );
  const actionOverlap = overlapItems(
    articleSignal.actions,
    clusterSignal.actions
  );
  const topicOverlap = overlapItems(articleSignal.topics, clusterSignal.topics);
  const allOverlap = overlapItems(articleSignal.all, clusterSignal.all);

  return {
    entityOverlap,
    actionOverlap,
    topicOverlap,
    allOverlap,
  };
}

function clusterScore(article: Article, cluster: ClusterDraft) {
  const { entityOverlap, actionOverlap, topicOverlap, allOverlap } =
    getSpecificOverlap(article, cluster);

  const strongEntityOverlap = getStrongItems(entityOverlap);
  const specificActionOverlap = getSpecificActionItems(actionOverlap);
  const specificTopicOverlap = getSpecificTopicItems(topicOverlap);

  let score = 0;

  score += strongEntityOverlap.length * 7;
  score += Math.min(entityOverlap.length - strongEntityOverlap.length, 1) * 1;
  score += specificActionOverlap.length * 4;
  score += Math.max(actionOverlap.length - specificActionOverlap.length, 0) * 1;
  score += specificTopicOverlap.length * 2;
  score += Math.min(allOverlap.length, 3);

  if (
    article.category &&
    cluster.category &&
    article.category === cluster.category &&
    !BROAD_CLUSTER_TERMS.has(article.category)
  ) {
    score += 1;
  }

  return score;
}

function shouldJoinCluster(article: Article, cluster: ClusterDraft) {
  if (!isWithinTimeWindow(article, cluster)) return false;
  if (hasContradictoryRegion(article, cluster)) return false;
  if (!areEventTypesCompatible(article, cluster)) return false;

  const { entityOverlap, actionOverlap, topicOverlap } = getSpecificOverlap(
    article,
    cluster
  );

  const score = clusterScore(article, cluster);
  const clusterSize = cluster.articles.length;
  const sources = unique(cluster.articles.map((item) => item.source));
  const sameSourceOnly =
    sources.length === 1 && sources[0] === article.source;

  const strongEntityOverlap = getStrongItems(entityOverlap);
  const specificActionOverlap = getSpecificActionItems(actionOverlap);
  const specificTopicOverlap = getSpecificTopicItems(topicOverlap);

  const hasStrongEntity = strongEntityOverlap.length >= 1;
  const hasMultipleStrongEntities = strongEntityOverlap.length >= 2;
  const hasSpecificAction = specificActionOverlap.length >= 1;
  const hasSpecificTopic = specificTopicOverlap.length >= 1;

  const hasEntityAndAction = hasStrongEntity && hasSpecificAction;
  const hasEntityAndTopic = hasStrongEntity && hasSpecificTopic;

  const onlyWeakEntityOverlap =
    entityOverlap.length > 0 &&
    strongEntityOverlap.length === 0 &&
    specificActionOverlap.length === 0 &&
    specificTopicOverlap.length === 0;

  if (onlyWeakEntityOverlap) return false;

  const hasConcreteAnchor =
    hasStrongEntity || hasSpecificAction || hasSpecificTopic;

  if (!hasConcreteAnchor) return false;

  if (sameSourceOnly && clusterSize <= 2) {
    return (
      score >= 15 &&
      (hasEntityAndAction ||
        hasMultipleStrongEntities ||
        (hasEntityAndTopic && hasSpecificAction))
    );
  }

  if (clusterSize >= 10) {
    return score >= 20 && (hasEntityAndAction || hasMultipleStrongEntities);
  }

  if (clusterSize >= 6) {
    return (
      score >= 17 &&
      (hasEntityAndAction || hasMultipleStrongEntities || hasEntityAndTopic)
    );
  }

  if (clusterSize >= 3) {
    return (
      score >= 14 &&
      (hasEntityAndAction || hasMultipleStrongEntities || hasEntityAndTopic)
    );
  }

  return (
    score >= 11 &&
    (hasEntityAndAction || hasMultipleStrongEntities || hasEntityAndTopic)
  );
}

/* ============================================================================
 * 11. Cluster creation and summaries
 * ========================================================================== */

function makeClusterTitle(articles: Article[]) {
  const sorted = [...articles].sort(
    (a, b) => toNumber(b.score) - toNumber(a.score)
  );

  return sorted[0]?.title ?? "未命名事件群組";
}

function hasChineseText(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function makeChineseEventLabel(articles: Article[]) {
  const signals = unique(
    articles.flatMap((article) => {
      const signal = getEventSignal(article);

      return [
        ...signal.entities.slice(0, 4),
        ...signal.actions.slice(0, 3),
        ...signal.topics.slice(0, 4),
      ];
    })
  )
    .filter((item) => !BROAD_CLUSTER_TERMS.has(item))
    .slice(0, 8);

  if (signals.length > 0) return signals.join("、");

  const chineseTitle = articles.find((article) =>
    hasChineseText(article.title)
  )?.title;

  return chineseTitle ?? "此事件";
}

function makeArticleExampleText(article: Article) {
  if (hasChineseText(article.title)) {
    return `「${article.title}」`;
  }

  const signal = getEventSignal(article);

  const signals = unique([
    ...signal.entities.slice(0, 3),
    ...signal.actions.slice(0, 2),
    ...signal.topics.slice(0, 3),
  ])
    .filter((item) => !BROAD_CLUSTER_TERMS.has(item))
    .slice(0, 6);

  if (signals.length > 0) {
    return `一篇關於「${signals.join("、")}」的外文報導`;
  }

  return "一篇相關外文報導";
}

function makeClusterSummary(articles: Article[]) {
  const sources = unique(articles.map((article) => article.source));
  const topArticles = articles.slice(0, 3);
  const eventLabel = makeChineseEventLabel(articles);

  if (articles.length > 3) {
    const signals = unique(
      articles.flatMap((article) => {
        const signal = getEventSignal(article);
        return [
          ...signal.entities.slice(0, 4),
          ...signal.actions.slice(0, 3),
          ...signal.topics.slice(0, 3),
        ];
      })
    )
      .filter((item) => !BROAD_CLUSTER_TERMS.has(item))
      .slice(0, 8);

    const coreSignalText =
      signals.length > 0 ? `核心訊號包括 ${signals.join("、")}。` : "";

    const articleExamples = topArticles
      .map((article) => makeArticleExampleText(article))
      .join("、");

    return `這個事件群組目前包含 ${articles.length} 篇新聞，來自 ${
      sources.length
    } 個來源，包括 ${sources.join(
      "、"
    )}。簡述：這組新聞大致圍繞「${eventLabel}」相關事件，反映多個來源正在追蹤同一條新聞線索。${coreSignalText}代表性新聞包括：${articleExamples}。`;
  }

  const articleExamples = topArticles
    .map((article) => makeArticleExampleText(article))
    .join("、");

  return `此事件群組由 ${articles.length} 篇新聞組成，來源包括 ${sources.join(
    "、"
  )}。事件主軸為「${eventLabel}」。主要新聞包括：${articleExamples}。`;
}

/* ============================================================================
 * 11.5 Gemini title and summary generation
 * ========================================================================== */

function safeParseGeminiJson(value: string) {
  const cleaned = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Partial<GeneratedClusterText>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]) as Partial<GeneratedClusterText>;
    } catch {
      return null;
    }
  }
}

function makeGeminiClusterPrompt(cluster: ClusterDraft) {
  const sources = unique(cluster.articles.map((article) => article.source));

  const articles = cluster.articles
    .slice(0, MAX_GEMINI_ARTICLES_PER_CLUSTER)
    .map((article, index) => {
      return [
        `Article ${index + 1}`,
        `Title: ${article.title}`,
        `Source: ${article.source}`,
        `Published at: ${article.published_at ?? "unknown"}`,
        `Category: ${article.category ?? "unknown"}`,
        `Region: ${article.region ?? "unknown"}`,
        `Summary: ${truncateText(article.summary, 700)}`,
      ].join("\n");
    })
    .join("\n\n");

  return `
你是 YardenPORTAL Intelligence Desk 的國際政治與政策風險分析助手。
請根據下列已經被系統分成同一 cluster 的新聞，生成一個繁體中文 title 和 summary。

嚴格規則：
1. 只能根據提供的新聞內容，不要新增外部事實。
2. 使用繁體中文。
3. title 不超過 28 個中文字。
4. title 必須指出「主要行為者 + 動作 / 爭議 / 風險」，不要只寫國名或地名。
5. summary 80 到 150 個中文字。
6. summary 要說清楚這組新聞在講什麼，以及為什麼值得追蹤。
7. 語氣保持保守、分析性，不要誇大，不要像社論。
8. 不要使用「這個事件群組」「這組新聞」作為 title。
9. 如果新聞其實只是同一區域但不是完全同一事件，請用保守標題，避免過度推論。
10. 只回傳 JSON，不要回傳 markdown，不要解釋。

回傳格式：
{
  "title": "繁體中文標題",
  "summary": "繁體中文摘要"
}

Cluster metadata:
- Current rule-based title: ${cluster.title}
- Current region: ${cluster.region ?? "unknown"}
- Current category: ${cluster.category ?? "unknown"}
- Article count: ${cluster.articles.length}
- Sources: ${sources.join("、")}

Articles:
${articles}
`.trim();
}

async function generateGeminiClusterText(
  cluster: ClusterDraft
): Promise<GeneratedClusterText> {
  const fallback: GeneratedClusterText = {
    title: cluster.title,
    summary: cluster.summary,
    source: "fallback",
  };

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return fallback;
  if (cluster.articles.length < 2) return fallback;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = makeGeminiClusterPrompt(cluster);

    const responsePromise = ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Gemini request timed out"));
      }, GEMINI_TIMEOUT_MS);
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const text = response.text ?? "";

    const parsed = safeParseGeminiJson(text);

    const title = truncateText(parsed?.title, 80);
    const summary = truncateText(parsed?.summary, 500);

    if (!title || !summary) return fallback;

    return {
      title,
      summary,
      source: "gemini",
    };
  } catch {
    return fallback;
  }
}

function updateCluster(cluster: ClusterDraft) {
  const scores = cluster.articles.map((article) => toNumber(article.score));
  const signals = getClusterSignals(cluster);

  cluster.score = Math.max(...scores);
  cluster.title = makeClusterTitle(cluster.articles);
  cluster.summary = makeClusterSummary(cluster.articles);

  cluster.tags = unique(
    cluster.articles.flatMap((article) => article.topic_tags ?? [])
  );

  cluster.matched_rules = unique(
    cluster.articles.flatMap((article) => article.matched_rules ?? [])
  );

  cluster.event_keywords = signals.all;

  const regions = unique(cluster.articles.map((article) => article.region));
  const categories = unique(cluster.articles.map((article) => article.category));
  const fingerprints = unique(
    cluster.articles.map((article) => article.event_fingerprint)
  );

  cluster.region = regions[0] ?? null;
  cluster.category = categories[0] ?? null;
  cluster.event_fingerprint = fingerprints[0] ?? null;
}

function createInitialCluster(article: Article): ClusterDraft {
  const signal = getEventSignal(article);

  const cluster: ClusterDraft = {
    title: article.title,
    summary: article.summary ?? "",
    score: toNumber(article.score),
    region: article.region,
    category: article.category,
    tags: article.topic_tags ?? [],
    matched_rules: article.matched_rules ?? [],
    event_keywords: signal.all,
    event_fingerprint: article.event_fingerprint,
    articles: [article],
  };

  updateCluster(cluster);

  return cluster;
}

function buildClusters(articles: Article[]) {
  const clusters: ClusterDraft[] = [];

  for (const article of articles) {
    let bestCluster: ClusterDraft | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const score = clusterScore(article, cluster);

      if (shouldJoinCluster(article, cluster) && score > bestScore) {
        bestCluster = cluster;
        bestScore = score;
      }
    }

    if (bestCluster) {
      bestCluster.articles.push(article);
      updateCluster(bestCluster);
    } else {
      clusters.push(createInitialCluster(article));
    }
  }

  return clusters.sort((a, b) => b.score - a.score);
}

/* ============================================================================
 * 12. API route
 * ========================================================================== */

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const url = new URL(request.url);
  const shouldGenerateAi = url.searchParams.get("ai") === "1";

  const { data: articles, error: articlesError } = await supabase
    .from("articles")
    .select(
      "id,title,source,url,published_at,summary,score,region,category,topic_tags,matched_rules,event_fingerprint,event_keywords"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ARTICLES);

  if (articlesError) {
    return NextResponse.json(
      { ok: false, error: articlesError.message },
      { status: 500 }
    );
  }

  const typedArticles = (articles ?? []) as Article[];
  const clusters = buildClusters(typedArticles);

  const { error: deleteRelationsError } = await supabase
    .from("cluster_articles")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteRelationsError) {
    return NextResponse.json(
      { ok: false, error: deleteRelationsError.message },
      { status: 500 }
    );
  }

  const { error: deleteClustersError } = await supabase
    .from("article_clusters")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (deleteClustersError) {
    return NextResponse.json(
      { ok: false, error: deleteClustersError.message },
      { status: 500 }
    );
  }

  let insertedClusters = 0;
  let insertedRelations = 0;
  let geminiGeneratedClusters = 0;

  for (const cluster of clusters) {
    const sources = unique(cluster.articles.map((article) => article.source));

    const shouldUseGemini =
      shouldGenerateAi &&
      cluster.articles.length >= 2 &&
      geminiGeneratedClusters < MAX_GEMINI_CLUSTERS_PER_REBUILD;

    const generatedText = shouldUseGemini
      ? await generateGeminiClusterText(cluster)
      : {
          title: cluster.title,
          summary: cluster.summary,
          source: "fallback" as const,
        };

    if (generatedText.source === "gemini") {
      geminiGeneratedClusters += 1;
    }

    const latestPublishedAt =
      cluster.articles
        .map((article) => article.published_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    const { data: insertedCluster, error: clusterError } = await supabase
      .from("article_clusters")
      .insert({
        title: generatedText.title,
        summary: generatedText.summary,
        summary_source: generatedText.source,
        score: cluster.score,
        region: cluster.region,
        category: cluster.category,
        tags: cluster.tags,
        matched_rules: cluster.matched_rules,
        article_count: cluster.articles.length,
        source_count: sources.length,
        latest_published_at: latestPublishedAt,
        status: "new",
      })
      .select("id")
      .single();

    if (clusterError || !insertedCluster) {
      return NextResponse.json(
        {
          ok: false,
          error: clusterError?.message ?? "Failed to insert cluster",
        },
        { status: 500 }
      );
    }

    insertedClusters += 1;

    const relations = cluster.articles.map((article) => ({
      cluster_id: insertedCluster.id,
      article_id: article.id,
    }));

    const { error: relationError } = await supabase
      .from("cluster_articles")
      .insert(relations);

    if (relationError) {
      return NextResponse.json(
        { ok: false, error: relationError.message },
        { status: 500 }
      );
    }

    insertedRelations += relations.length;
  }

  return NextResponse.json({
    ok: true,
    articles: typedArticles.length,
    clusters: insertedClusters,
    relations: insertedRelations,
    method:
      "high precision event clustering with Gemini-generated title and summary",
    gemini_enabled: Boolean(process.env.GEMINI_API_KEY),
    ai_requested: shouldGenerateAi,
    gemini_generated_clusters: geminiGeneratedClusters,
    max_articles: MAX_ARTICLES,
    time_window_hours: TIME_WINDOW_HOURS,
  });
}
