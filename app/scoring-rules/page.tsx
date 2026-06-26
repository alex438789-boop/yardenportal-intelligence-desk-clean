import { ScoringRulesManager } from "@/components/scoring-rules-manager";

export const dynamic = "force-dynamic";

export default function ScoringRulesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-slate-500">
          Topic Scoring System
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          選題關鍵字與加權設定
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          你可以在這裡新增、刪除或修改關鍵字規則。Articles 轉成 Topic 時，系統會根據這些規則計算推薦分數、區域分類與 tags。
        </p>
      </div>

      <ScoringRulesManager />
    </main>
  );
}