import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;

  if (expected && authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // MVP placeholder: later, fetch RSS feeds, insert articles into Supabase, cluster topics, and score them.
  return NextResponse.json({
    ok: true,
    message: "Cron endpoint is ready. RSS fetching will be implemented in the next iteration."
  });
}
