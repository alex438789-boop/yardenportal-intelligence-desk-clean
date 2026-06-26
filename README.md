# YardenPORTAL Intelligence Desk

一個給 YardenPORTAL 使用的國際議題觀測台 MVP。

第一版重點：

- Dashboard 顯示今日推薦議題
- 議題卡片包含分數、區域、類型、推薦理由
- 議題詳情頁顯示相關新聞來源與值得觀察的問題
- 可按下「生成 YardenPORTAL 草稿」
- 若尚未設定 `OPENAI_API_KEY`，系統會回傳 fallback 假草稿，方便先測 UI
- 附 Supabase schema，下一階段可接真資料庫
- 附 Vercel cron endpoint 佔位，下一階段可接 RSS 抓取

## 技術

- Next.js App Router
- Tailwind CSS
- Supabase / PostgreSQL
- OpenAI API
- RSS feeds
- Vercel

## 本機啟動

```bash
npm install
cp .env.example .env.local
npm run dev
```

然後打開：

```bash
http://localhost:3000
```

## 環境變數

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
CRON_SECRET=change-me
```

MVP 現在可以不用 Supabase 與 OpenAI key 先跑起來。

- 沒有 Supabase key：使用 `data/mock.ts` 假資料
- 沒有 OpenAI key：草稿生成 API 會回傳 fallback draft

## Supabase schema

到 Supabase 專案 SQL editor 執行：

```sql
-- 見 supabase/schema.sql
```

資料表：

- `articles`
- `topics`
- `drafts`
- `source_feeds`

## 專案結構

```text
app/
  api/
    cron/route.ts       # Vercel Cron endpoint 佔位
    drafts/route.ts     # 草稿生成 API
  drafts/page.tsx       # 草稿列表
  sources/page.tsx      # 來源管理
  settings/page.tsx     # 風格設定
  topics/page.tsx       # 議題庫
  topics/[id]/page.tsx  # 議題詳情
components/
  sidebar.tsx
  topic-card.tsx
  generate-draft-button.tsx
data/
  mock.ts               # 假資料
lib/
  mock-db.ts
  supabase.ts
  types.ts
  yarden-prompt.ts
supabase/
  schema.sql
```

## 下一步開發建議

1. 將 `data/mock.ts` 改成從 Supabase 讀取。
2. 在 `source_feeds` 填入 RSS URL。
3. 在 `/api/cron` 加入 RSS 抓取、去重與 `articles` 寫入。
4. 用 OpenAI API 對文章進行分類、摘要、評分。
5. 將高分新聞 cluster 成 `topics`。
6. 將 `/api/drafts` 生成結果寫入 `drafts`。
7. 加上登入與人工審核流程。

## 重要提醒

AI 草稿只能作為初稿。戰爭、死亡人數、官方聲明、制裁、軍事部署與外交談判等內容，發布前都應人工查證。
