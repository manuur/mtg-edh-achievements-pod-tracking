"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ActivityChart({ data, caption = "Games by month" }: { data: { period: string; games: number }[]; caption?: string }) {
  if (!data.length) return <div className="grid h-64 place-items-center text-sm text-stone-500">Record games to see activity over time.</div>;
  return <div><div className="h-64" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="period" tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--chart-tooltip)", border: "1px solid var(--chart-grid)", borderRadius: 12, color: "var(--foreground)" }} /><Bar dataKey="games" fill="var(--chart-accent)" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer></div><table className="sr-only"><caption>{caption}</caption><tbody>{data.map((row) => <tr key={row.period}><th>{row.period}</th><td>{row.games}</td></tr>)}</tbody></table></div>;
}
