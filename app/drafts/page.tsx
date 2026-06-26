import { getDrafts } from "@/lib/db";

export default async function DraftsPage() {
  
  const drafts = await getDrafts();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Drafts 草稿</h1>
      <p className="mt-3 text-slate-600">現在會優先從 Supabase 讀取草稿；若資料庫尚未填入資料，才顯示備用假資料。</p>
      <div className="mt-8 grid gap-5">
        {drafts.map((draft) => (
          <article key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold">{draft.igTitle}</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">{draft.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {draft.subheadings.map((h) => <span key={h} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{h}</span>)}
            </div>
            <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{draft.caption}</pre>
            <p className="mt-4 text-xs text-slate-500">來源：{draft.sources.join("、")}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
