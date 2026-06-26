import { topics, drafts } from "@/data/mock";

export function getTopics() {
  return topics;
}

export function getTopic(id: string) {
  return topics.find((topic) => topic.id === id);
}

export function getDrafts() {
  return drafts;
}
