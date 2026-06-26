import Link from "next/link";
import { Newspaper, Radar, FileText, Rss, Settings } from "lucide-react";

const nav = [
  { href: "/", label: "Radar 今日雷達", icon: Radar },
  { href: "/topics", label: "Topics 議題庫", icon: Newspaper },
  { href: "/drafts", label: "Drafts 草稿", icon: FileText },
  { href: "/articles", label: "Articles 新聞池", icon: Waves },
  { href: "/sources", label: "Sources 來源", icon: Rss },
  { href: "/settings", label: "Settings 設定", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-white p-5 lg:min-h-screen lg:border-b-0 lg:border-r">
      <Link href="/" className="block rounded-2xl bg-slate-950 p-5 text-white">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-300">YardenPORTAL</p>
        <h1 className="mt-2 text-xl font-semibold leading-tight">Intelligence Desk</h1>
        <p className="mt-3 text-sm text-slate-300">國際議題觀測台</p>
      </Link>
      <nav className="mt-6 grid gap-2">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
