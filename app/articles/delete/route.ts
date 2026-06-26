import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { articleId } = await request.json();

    if (!articleId) {
      return NextResponse.json(
        { ok: false, error: "Missing articleId" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("articles")
      .delete()
      .eq("id", articleId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}