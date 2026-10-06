import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { TableEntry } from "./table-entry";

export default async function TablePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("get_table", { p_slug: slug, p_token: token });
  if (!data) notFound();
  return <TableEntry token={token} label={(data as { label: string }).label} />;
}
