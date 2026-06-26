const sources = [
  { name: "Reuters", type: "國際通訊社", status: "planned" },
  { name: "AP", type: "國際通訊社", status: "planned" },
  { name: "BBC", type: "國際媒體", status: "planned" },
  { name: "DW", type: "國際媒體", status: "planned" },
  { name: "CNA", type: "中文來源", status: "planned" },
  { name: "VOA 中文", type: "中文來源", status: "planned" },
  { name: "NATO", type: "官方來源", status: "planned" },
  { name: "IAEA", type: "官方來源", status: "planned" }
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Sources 來源管理</h1>
      <p className="mt-3 text-slate-600">第一版先列出來源清單；下一步再加入 RSS URL 與抓取排程。</p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="p-4">來源</th><th className="p-4">類型</th><th className="p-4">狀態</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.map((source) => (
              <tr key={source.name}><td className="p-4 font-medium">{source.name}</td><td className="p-4 text-slate-600">{source.type}</td><td className="p-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{source.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
