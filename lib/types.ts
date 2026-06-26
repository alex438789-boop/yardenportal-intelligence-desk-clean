export type Article = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
};

export type Topic = {
  id: string;
  title: string;
  score: number;
  region: string;
  category: string;
  rationale: string;
  tags: string[];
  status: "new" | "selected" | "drafted" | "published";
  articles: Article[];
  keyQuestions: string[];
};

export type Draft = {
  id: string;
  topicId: string;
  igTitle: string;
  subheadings: string[];
  caption: string;
  sources: string[];
  hashtags: string[];
  status: "draft" | "reviewed" | "published";
};
