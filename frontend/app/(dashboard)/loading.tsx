// Shown automatically by Next.js while a dashboard route segment loads —
// replaces the blank white flash that every page navigation had before,
// which is a big part of why the app *felt* slower than it was.
export default function DashboardLoading() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="w-60 border-r border-slate-200 dark:border-slate-800 shrink-0 p-4 space-y-6">
        <div className="h-7 w-28 rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full">
        <div className="h-8 w-56 rounded-md bg-slate-200 dark:bg-slate-800 animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 animate-pulse" />
      </div>
    </div>
  );
}
