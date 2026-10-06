"use client";
import { Button } from "@/components/ui/button";
import { downloadCSV } from "@/lib/csv";

export function ExportButton({ name, rows, columns }: { name: string; rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }) {
  return <Button size="xs" variant="ghost" icon="download" disabled={!rows.length} onClick={() => downloadCSV(name, rows, columns)}>CSV</Button>;
}
