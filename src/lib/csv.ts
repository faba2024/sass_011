// Exportação CSV no navegador (abre no Excel com acentuação correta)
export function toCSV(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(";")).join("\n");
  return `﻿${header}\n${body}`;
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const blob = new Blob([toCSV(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
