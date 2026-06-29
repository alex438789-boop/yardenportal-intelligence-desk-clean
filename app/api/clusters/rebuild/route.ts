import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

const MAX_ARTICLES = 100;
const TIME_WINDOW_HOURS = 72;

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

const ALIAS_MAP: Record<string, string> = {
  "donald trump": "川普",
  trump: "川普",
  "jd vance": "范斯",
  "j.d. vance": "范斯",
  vance: "范斯",
  "joe biden": "拜登",
  biden: "拜登",
  "xi jinping": "習近平",
  xi: "習近平",
  "lai ching-te": "賴清德",
  "lai ching te": "賴清德",
  "william lai": "賴清德",
  "han kuo-yu": "韓國瑜",
  "han kuo yu": "韓國瑜",
  "ko wen-je": "柯文哲",
  "ko wen je": "柯文哲",
  "huang kuo-chang": "黃國昌",
  "huang kuo chang": "黃國昌",
  "ma ying-jeou": "馬英九",
  "ma ying jeou": "馬英九",
  "vladimir putin": "普丁",
  putin: "普丁",
  "volodymyr zelenskyy": "澤倫斯基",
  zelenskyy: "澤倫斯基",
  zelensky: "澤倫斯基",
  "benjamin netanyahu": "內塔尼亞胡",
  netanyahu: "內塔尼亞胡",
  "ali khamenei": "哈梅內伊",
  khamenei: "哈梅內伊",
  "emmanuel macron": "馬克宏",
  macron: "馬克宏",

  "white house": "白宮",
  "state department": "國務院",
  "u.s. state department": "國務院",
  "us state department": "國務院",
  pentagon: "五角大廈",
  "u.s. congress": "美國國會",
  "us congress": "美國國會",
  congress: "美國國會",
  senate: "美國參議院",
  "house of representatives": "美國眾議院",
  "federal reserve": "聯準會",
  fed: "聯準會",
  "treasury department": "美國財政部",
  "department of defense": "美國國防部",
  "ministry of national defense": "國防部",
  "mainland affairs council": "陸委會",
  "legislative yuan": "立法院",
  "executive yuan": "行政院",
  "presidential office": "總統府",
  "kuomintang": "國民黨",
  kmt: "國民黨",
  dpp: "民進黨",
  "democratic progressive party": "民進黨",
  tpp: "民眾黨",
  "taiwan people's party": "民眾黨",

  nato: "北約",
  "north atlantic treaty organization": "北約",
  eu: "歐盟",
  "european union": "歐盟",
  "european parliament": "歐洲議會",
  un: "聯合國",
  "united nations": "聯合國",
  "security council": "安理會",
  wto: "世貿組織",
  who: "WHO",
  imf: "IMF",
  "world bank": "世界銀行",
  icj: "國際法院",
  icc: "國際刑事法院",

  china: "中國",
  "people's republic of china": "中國",
  prc: "中國",
  taiwan: "臺灣",
  "republic of china": "中華民國",
  roc: "中華民國",
  "united states": "美國",
  "u.s.": "美國",
  "us": "美國",
  america: "美國",
  japan: "日本",
  "south korea": "南韓",
  korea: "南韓",
  "north korea": "北韓",
  philippines: "菲律賓",
  vietnam: "越南",
  india: "印度",
  indonesia: "印尼",
  myanmar: "緬甸",
  thailand: "泰國",
  singapore: "新加坡",
  australia: "澳洲",
  uk: "英國",
  britain: "英國",
  france: "法國",
  germany: "德國",
  italy: "義大利",
  turkey: "土耳其",
  türkiye: "土耳其",
  iran: "伊朗",
  israel: "以色列",
  gaza: "加薩",
  hamas: "哈瑪斯",
  hezbollah: "真主黨",
  houthis: "胡塞",
  ukraine: "烏克蘭",
  russia: "俄羅斯",
  qatar: "卡達",
  "saudi arabia": "沙烏地",

  tsmc: "台積電",
  nvidia: "輝達",
  asml: "ASML",
  openai: "OpenAI",
  google: "Google",
  microsoft: "Microsoft",
  apple: "Apple",
  tesla: "Tesla",

  "taiwan strait": "臺海",
  "south china sea": "南海",
  "east china sea": "東海",
  "red sea": "紅海",
  "black sea": "黑海",

  visit: "訪問",
  visits: "訪問",
  visited: "訪問",
  visiting: "訪問",
  delegation: "訪團",
  "congressional delegation": "國會訪團",
  meet: "會晤",
  meets: "會晤",
  met: "會晤",
  meeting: "會晤",
  talk: "會談",
  talks: "會談",
  call: "通話",
  calls: "通話",
  announce: "宣布",
  announces: "宣布",
  announced: "宣布",
  warning: "警告",
  warn: "警告",
  warns: "警告",
  warned: "警告",
  condemn: "譴責",
  condemns: "譴責",
  condemned: "譴責",
  sanction: "制裁",
  sanctions: "制裁",
  sanctioned: "制裁",
  tariff: "關稅",
  tariffs: "關稅",
  "export control": "出口管制",
  "export controls": "出口管制",
  ceasefire: "停火",
  "cease-fire": "停火",
  attack: "攻擊",
  attacks: "攻擊",
  attacked: "攻擊",
  strike: "攻擊",
  strikes: "攻擊",
  struck: "攻擊",
  airstrike: "空襲",
  airstrikes: "空襲",
  bombing: "轟炸",
  blockade: "封鎖",
  deploy: "部署",
  deploys: "部署",
  deployed: "部署",
  deployment: "部署",
  exercise: "軍演",
  exercises: "軍演",
  drill: "軍演",
  drills: "軍演",
  patrol: "巡邏",
  patrols: "巡邏",
  launch: "發射",
  launches: "發射",
  launched: "發射",
  pass: "通過",
  passes: "通過",
  passed: "通過",
  vote: "表決",
  votes: "表決",
  voted: "表決",
  reject: "否決",
  rejects: "否決",
  rejected: "否決",
  investigate: "調查",
  investigates: "調查",
  investigated: "調查",
  arrest: "逮捕",
  arrests: "逮捕",
  arrested: "逮捕",
  election: "選舉",
  elections: "選舉",
  recall: "罷免",
  protest: "抗議",
  protests: "抗議",
  summit: "峰會",

  semiconductor: "半導體",
  semiconductors: "半導體",
  chip: "晶片",
  chips: "晶片",
  "ai chip": "AI晶片",
  "ai chips": "AI晶片",
  "artificial intelligence": "人工智慧",
  "rare earth": "稀土",
  "rare earths": "稀土",
  "critical minerals": "關鍵礦物",
  "supply chain": "供應鏈",
  "supply chains": "供應鏈",
  energy: "能源",
  "natural gas": "天然氣",
  oil: "石油",
  nuclear: "核電",
  "renewable energy": "再生能源",
  "defense spending": "軍費",
  "defence spending": "軍費",
  "defense budget": "國防預算",
  "defence budget": "國防預算",
  missile: "飛彈",
  missiles: "飛彈",
  drone: "無人機",
  drones: "無人機",
  warship: "軍艦",
  warships: "軍艦",
  aircraft: "軍機",
  carrier: "航母",
  submarine: "潛艦",
  cybersecurity: "網路安全",
  "cyber security": "網路安全",
  disinformation: "假訊息",
  "digital sovereignty": "數位主權",
  immigration: "移民",
  refugee: "難民",
  refugees: "難民",
  border: "邊境",
  trade: "貿易",
  investment: "投資",
  inflation: "通膨",
  "interest rate": "利率",
  "interest rates": "利率",
};

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
  "台積電",
  "輝達",
  "Nvidia",
  "ASML",
  "OpenAI",
  "Google",
  "Microsoft",
  "Apple",
  "Tesla",
  "伊朗",
  "以色列",
  "加薩",
  "哈瑪斯",
  "真主黨",
  "胡塞",
  "烏克蘭",
  "俄羅斯",
  "中國",
  "美國",
  "日本",
  "南韓",
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
  "金門",
  "馬祖",
  "台海",
  "臺海",
  "南海",
  "東海",
  "紅海",
  "黑海",
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
  "警告",
  "譴責",
  "制裁",
  "反制",
  "封鎖",
  "禁運",
  "出口管制",
  "關稅",
  "談判",
  "協議",
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
  "入侵",
  "衝突",
];

const POLICY_TOPICS = [
  "半導體",
  "晶片",
  "AI晶片",
  "人工智慧",
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
  "資料中心",
  "移民",
  "難民",
  "邊境",
  "貿易",
  "投資",
  "匯率",
  "通膨",
  "利率",
];

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 5.5;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 5.5 : numberValue;
}

function unique(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function cleanToken(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function normalizeAlias(value: string) {
  const normalized = normalize(value);
  return ALIAS_MAP[normalized] ?? value;
}

function normalizeAliasList(values: string[]) {
  return unique(values.map((value) => normalizeAlias(value)));
}

function extractAliases(text: string) {
  const lowerText = text.toLowerCase();

  return Object.entries(ALIAS_MAP)
    .filter(([alias]) => lowerText.includes(alias.toLowerCase()))
    .map(([, canonical]) => canonical);
}

function extractKnownTerms(text: string, dictionary: string[]) {
  return dictionary.filter((term) => text.includes(term));
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
  ]).filter((item) => !BROAD_CLUSTER_TERMS.has(item));

  return {
    entities,
    actions: eventActions,
    topics,
    all,
  };
}

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

  const broadRegions = new Set(["全球", "國際", "國際政治"]);

  if (broadRegions.has(article.region) || broadRegions.has(cluster.region)) {
    return false;
  }

  return article.region !== cluster.region;
}

function getSpecificOverlap(article: Article, cluster: ClusterDraft) {
  const articleSignal = getEventSignal(article);
  const clusterSignal = getClusterSignals(cluster);

  const entityOverlap = overlapItems(articleSignal.entities, clusterSignal.entities);
  const actionOverlap = overlapItems(articleSignal.actions, clusterSignal.actions);
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

  let score = 0;

  score += entityOverlap.length * 5;
  score += actionOverlap.length * 3;
  score += topicOverlap.length * 2;
  score += Math.min(allOverlap.length, 6);

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

  const { entityOverlap, actionOverlap, topicOverlap, allOverlap } =
    getSpecificOverlap(article, cluster);

  const score = clusterScore(article, cluster);
  const clusterSize = cluster.articles.length;

  const hasEntityAndAction =
    entityOverlap.length >= 1 && actionOverlap.length >= 1;

  const hasMultipleEntities = entityOverlap.length >= 2;

  const hasEntityAndTopic =
    entityOverlap.length >= 1 && topicOverlap.length >= 1;

  const hasStrongKeywordOverlap = allOverlap.length >= 5;

  if (clusterSize >= 6) {
    return (
      score >= 15 &&
      (hasEntityAndAction || hasMultipleEntities || hasEntityAndTopic)
    );
  }

  if (clusterSize >= 3) {
    return (
      score >= 12 &&
      (hasEntityAndAction ||
        hasMultipleEntities ||
        hasEntityAndTopic ||
        hasStrongKeywordOverlap)
    );
  }

  return (
    score >= 9 &&
    (hasEntityAndAction ||
      hasMultipleEntities ||
      hasEntityAndTopic ||
      hasStrongKeywordOverlap)
  );
}

function makeClusterTitle(articles: Article[]) {
  const sorted = [...articles].sort(
    (a, b) => toNumber(b.score) - toNumber(a.score)
  );

  return sorted[0]?.title ?? "未命名事件群組";
}

function makeClusterSummary(articles: Article[]) {
  const sources = unique(articles.map((article) => article.source));
  const topArticles = articles.slice(0, 3);
  const highestScoreArticle = [...articles].sort(
    (a, b) => toNumber(b.score) - toNumber(a.score)
  )[0];

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
    ).slice(0, 8);

    const coreSignalText =
      signals.length > 0 ? `核心訊號包括 ${signals.join("、")}。` : "";

    const articleExamples = topArticles
      .map((article) => `「${article.title}」`)
      .join("、");

    return `這個事件群組目前包含 ${articles.length} 篇新聞，來自 ${sources.length} 個來源，包括 ${sources.join(
      "、"
    )}。簡述：這組新聞大致圍繞「${
      highestScoreArticle?.title ?? articles[0]?.title ?? "未命名事件"
    }」所代表的事件或議題發展，反映多個來源正在追蹤同一條新聞線索。${coreSignalText}代表性新聞包括：${articleExamples}。`;
  }

  return `此事件群組由 ${articles.length} 篇新聞組成，來源包括 ${sources.join(
    "、"
  )}。主要新聞包括：${topArticles
    .map((article) => `「${article.title}」`)
    .join("、")}。`;
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

export async function GET() {
  const supabase = createSupabaseServerClient();

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

  for (const cluster of clusters) {
    const sources = unique(cluster.articles.map((article) => article.source));

    const latestPublishedAt =
      cluster.articles
        .map((article) => article.published_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    const { data: insertedCluster, error: clusterError } = await supabase
      .from("article_clusters")
      .insert({
        title: cluster.title,
        summary: cluster.summary,
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
    method: "entity-action-topic clustering with english alias normalization",
    max_articles: MAX_ARTICLES,
    time_window_hours: TIME_WINDOW_HOURS,
  });
}