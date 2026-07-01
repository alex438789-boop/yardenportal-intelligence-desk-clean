import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    clusterId?: string;
  } | null;

  const clusterId = body?.clusterId;

  if (!clusterId) {
    return NextResponse.json(
      { ok: false, error: "Missing clusterId" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  const { error: relationError } = await supabase
    .from("cluster_articles")
    .delete()
    .eq("cluster_id", clusterId);

  if (relationError) {
    return NextResponse.json(
      { ok: false, error: relationError.message },
      { status: 500 }
    );
  }

  const { error: clusterError } = await supabase
    .from("article_clusters")
    .delete()
    .eq("id", clusterId);

  if (clusterError) {
    return NextResponse.json(
      { ok: false, error: clusterError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted_cluster_id: clusterId,
  });
}