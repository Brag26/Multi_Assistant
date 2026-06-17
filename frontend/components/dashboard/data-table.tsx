import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function DataTable<T extends { id: string }>({ columns, rows }: { columns: { key: keyof T | string; label: string; render?: (row: T) => ReactNode }[]; rows: T[] }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-slate-100 text-xs uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={String(column.key)} className="px-4 py-3 font-medium">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {columns.map((column) => <td key={String(column.key)} className="px-4 py-3">{column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
