export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">Settings 風格設定</h1>
      <p className="mt-3 text-slate-600">這裡保存 YardenPORTAL 草稿生成規則。MVP 先以文字顯示，之後可改成可編輯設定。</p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">YardenPORTAL 草稿規則</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
          <li>以新聞事件為起點，而不是單純評論。</li>
          <li>補充歷史、制度、法律、地理或供應鏈背景。</li>
          <li>分析國內政治、區域安全、大國競爭或供應鏈結構。</li>
          <li>避免誇大戰爭風險，不斷言全面戰爭必然發生。</li>
          <li>結尾提出值得觀察的問題，保留後續追蹤空間。</li>
          <li>語氣介於新聞解釋、國際關係分析與公共知識推廣之間。</li>
        </ul>
      </div>
    </div>
  );
}
