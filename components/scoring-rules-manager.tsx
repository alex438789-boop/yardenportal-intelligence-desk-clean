"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type ScoringRule = {
  id: string;
  label: string;
  keywords: string[];
  score_delta: number;
  region: string | null;
  category: string | null;
  tags: string[];
  is_active: boolean;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ScoringRulesManager() {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [label, setLabel] = useState("");
  const [keywords, setKeywords] = useState("");
  const [scoreDelta, setScoreDelta] = useState("1");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");

  async function loadRules() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("scoring_rules")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
    } else {
      setRules(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadRules();
  }, []);

  async function addRule() {
    setMessage("");

    if (!label.trim()) {
      setMessage("請輸入規則名稱");
      return;
    }

    if (!keywords.trim()) {
      setMessage("請至少輸入一個關鍵字");
      return;
    }

    const { error } = await supabase.from("scoring_rules").insert({
      label: label.trim(),
      keywords: splitList(keywords),
      score_delta: Number(scoreDelta),
      region: region.trim() || null,
      category: category.trim() || null,
      tags: splitList(tags),
      is_active: true,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setLabel("");
    setKeywords("");
    setScoreDelta("1");
    setRegion("");
    setCategory("");
    setTags("");

    setMessage("已新增規則");
    await loadRules();
  }

  async function updateRule(rule: ScoringRule) {
    const { error } = await supabase
      .from("scoring_rules")
      .update({
        label: rule.label,
        keywords: rule.keywords,
        score_delta: rule.score_delta,
        region: rule.region,
        category: rule.category,
        tags: rule.tags,
        is_active: rule.is_active,
      })
      .eq("id", rule.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("已更新規則");
      await loadRules();
    }
  }

  async function deleteRule(id: string) {
    const confirmed = window.confirm("確定要刪除這條規則嗎？");
    if (!confirmed) return;

    const { error } = await supabase
      .from("scoring_rules")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("已刪除規則");
      await loadRules();
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">新增評分規則</h2>
        <p className="mt-2 text-sm text-slate-500">
          關鍵字與 tags 請用英文逗號分隔，例如：台灣, 台海, 共軍。
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="規則名稱，例如：台海安全"
            className="rounded-xl border border-slate-300 px-4 py-2"
          />

          <input
            value={scoreDelta}
            onChange={(event) => setScoreDelta(event.target.value)}
            placeholder="加權分數，例如：2"
            type="number"
            step="0.5"
            className="rounded-xl border border-slate-300 px-4 py-2"
          />

          <input
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="區域，例如：台灣／中國"
            className="rounded-xl border border-slate-300 px-4 py-2"
          />

          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="分類，例如：台海安全"
            className="rounded-xl border border-slate-300 px-4 py-2"
          />

          <textarea
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            placeholder="關鍵字，例如：台灣, 台海, 共軍, PLA"
            className="rounded-xl border border-slate-300 px-4 py-2 md:col-span-2"
            rows={3}
          />

          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="tags，例如：台海, 灰色地帶"
            className="rounded-xl border border-slate-300 px-4 py-2 md:col-span-2"
          />
        </div>

        <button
          onClick={addRule}
          className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          新增規則
        </button>
      </section>

      {message && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-bold">目前規則</h2>

        {loading && <p className="text-slate-500">讀取中...</p>}

        {!loading && rules.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-500">
            目前還沒有規則。
          </p>
        )}

        {rules.map((rule) => (
          <RuleEditor
            key={rule.id}
            rule={rule}
            onSave={updateRule}
            onDelete={deleteRule}
          />
        ))}
      </section>
    </div>
  );
}

function RuleEditor({
  rule,
  onSave,
  onDelete,
}: {
  rule: ScoringRule;
  onSave: (rule: ScoringRule) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    ...rule,
    keywordsText: rule.keywords.join(", "),
    tagsText: rule.tags.join(", "),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={draft.label}
          onChange={(event) =>
            setDraft({ ...draft, label: event.target.value })
          }
          className="rounded-xl border border-slate-300 px-4 py-2"
        />

        <input
          value={draft.score_delta}
          onChange={(event) =>
            setDraft({ ...draft, score_delta: Number(event.target.value) })
          }
          type="number"
          step="0.5"
          className="rounded-xl border border-slate-300 px-4 py-2"
        />

        <input
          value={draft.region ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, region: event.target.value || null })
          }
          placeholder="region"
          className="rounded-xl border border-slate-300 px-4 py-2"
        />

        <input
          value={draft.category ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, category: event.target.value || null })
          }
          placeholder="category"
          className="rounded-xl border border-slate-300 px-4 py-2"
        />

        <textarea
          value={draft.keywordsText}
          onChange={(event) =>
            setDraft({ ...draft, keywordsText: event.target.value })
          }
          className="rounded-xl border border-slate-300 px-4 py-2 md:col-span-2"
          rows={3}
        />

        <input
          value={draft.tagsText}
          onChange={(event) =>
            setDraft({ ...draft, tagsText: event.target.value })
          }
          className="rounded-xl border border-slate-300 px-4 py-2 md:col-span-2"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) =>
              setDraft({ ...draft, is_active: event.target.checked })
            }
          />
          啟用
        </label>

        <button
          onClick={() =>
            onSave({
              id: draft.id,
              label: draft.label,
              keywords: splitList(draft.keywordsText),
              score_delta: Number(draft.score_delta),
              region: draft.region,
              category: draft.category,
              tags: splitList(draft.tagsText),
              is_active: draft.is_active,
            })
          }
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          儲存
        </button>

        <button
          onClick={() => onDelete(draft.id)}
          className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          刪除
        </button>
      </div>
    </div>
  );
}