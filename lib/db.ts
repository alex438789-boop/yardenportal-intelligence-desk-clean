import { topics as mockTopics, drafts as mockDrafts } from "@/data/mock";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Article, Draft, Topic } from "@/lib/types";

type DbTopic = {
  id: string;
  title: string;
  score: number | string;
  region: string | null;
  category: string | null;
  rationale: string | null;
  status: Topic["status"] | null;
  tags: string[] | null;
  articles: Article[] | null;
  key_questions: string[] | null;
};

type DbDraft = {
  id: string;
  topic_id: string | null;
  title: string;
  body: string;
  sources: string[] | null;
  hashtags: string[] | null;
  subheadings: string[] | null;
  status: Draft["status"] | null;
};

function mapTopic(row: DbTopic): Topic {
  return {
    id: row.id,
    title: row.title,
    score: Number(row.score),
    region: row.region ?? "未分類",
    category: row.category ?? "未分類",
    rationale: row.rationale ?? "",
    tags: row.tags ?? [],
    status: row.status ?? "new",
    articles: row.articles ?? [],
    keyQuestions: row.key_questions ?? []
  };
}

function mapDraft(row: DbDraft): Draft {
  return {
    id: row.id,
    topicId: row.topic_id ?? "",
    igTitle: row.title,
    subheadings: row.subheadings ?? [],
    caption: row.body,
    sources: row.sources ?? [],
    hashtags: row.hashtags ?? [],
    status: row.status ?? "draft"
  };
}

function canUseSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getTopics(): Promise<Topic[]> {
  if (!canUseSupabase()) return mockTopics;

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("topics")
      .select("id,title,score,region,category,rationale,status,tags,articles,key_questions")
      .order("score", { ascending: false });

    if (error) throw error;
    return data && data.length > 0 ? data.map(mapTopic) : mockTopics;
  } catch (error) {
    console.error("Failed to load topics from Supabase:", error);
    return mockTopics;
  }
}

export async function getTopic(id: string): Promise<Topic | undefined> {
  if (!canUseSupabase()) return mockTopics.find((topic) => topic.id === id);

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("topics")
      .select("id,title,score,region,category,rationale,status,tags,articles,key_questions")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? mapTopic(data) : mockTopics.find((topic) => topic.id === id);
  } catch (error) {
    console.error("Failed to load topic from Supabase:", error);
    return mockTopics.find((topic) => topic.id === id);
  }
}

export async function getDrafts(): Promise<Draft[]> {
  if (!canUseSupabase()) return mockDrafts;

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("drafts")
      .select("id,topic_id,title,body,sources,hashtags,subheadings,status")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data && data.length > 0 ? data.map(mapDraft) : mockDrafts;
  } catch (error) {
    console.error("Failed to load drafts from Supabase:", error);
    return mockDrafts;
  }
}

export async function saveDraft(draft: Draft) {
  if (!canUseSupabase()) return;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("drafts").insert({
    topic_id: draft.topicId,
    title: draft.igTitle,
    body: draft.caption,
    sources: draft.sources,
    hashtags: draft.hashtags,
    subheadings: draft.subheadings,
    status: draft.status
  });

  if (error) {
    console.error("Failed to save draft to Supabase:", error);
    throw new Error(error.message);
  }
}
