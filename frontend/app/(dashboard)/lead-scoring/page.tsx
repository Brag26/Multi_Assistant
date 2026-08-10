"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { listLeadScores, rescoreContact, type LeadScore } from "@/lib/api-features";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp } from "lucide-react";

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${
        score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-500"
      }`}>{score}</span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-600", contacted: "bg-blue-50 text-blue-700",
  qualified: "bg-violet-50 text-violet-700", nurturing: "bg-amber-50 text-amber-700",
  converted: "bg-emerald-50 text-emerald-700", lost: "bg-red-50 text-red-700",
};

export default function LeadScoringPage() {
  const tenantId = useSessionStore(s => s.tenantId) ?? process.env.NEXT_PUBLIC_DEMO_TENANT_ID ?? "";
  const queryClient = useQueryClient();

  const { data: scores = [], isLoading } = useQuery<LeadScore[]>({
    queryKey: ["lead-scores", tenantId],
    queryFn: () => listLeadScores(tenantId, 0),
    enabled: Boolean(tenantId),
  });

  const rescoreMut = useMutation({
    mutationFn: (contactId: string) => rescoreContact(tenantId, contactId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead-scores", tenantId] }),
  });

  const highValue = scores.filter(s => s.lead_score >= 70).length;
  const medium = scores.filter(s => s.lead_score >= 40 && s.lead_score < 70).length;
  const low = scores.filter(s => s.lead_score < 40).length;

  return (
    <DashboardShell>
      <div className="mb-6">
        <p className="text-sm font-medium text-blue-700">CRM</p>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <TrendingUp className="w-6 h-6" /> Lead Scoring
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-emerald-600">{highValue}</p>
            <p className="text-xs text-slate-500">High value (70–100)</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-amber-600">{medium}</p>
            <p className="text-xs text-slate-500">Medium (40–69)</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-red-500">{low}</p>
            <p className="text-xs text-slate-500">Low (0–39)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : scores.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No lead scores yet. Scores are calculated hourly based on call history and engagement.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-48">Score</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {scores.map(s => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{s.name || s.phone}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.phone}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${STATUS_COLORS[s.lead_status] ?? ""}`}>
                        {s.lead_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <ScoreBar score={s.lead_score} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {s.score_updated_at ? new Date(s.score_updated_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        title="Rescore now"
                        onClick={() => rescoreMut.mutate(s.id)}
                        disabled={rescoreMut.isPending}>
                        <RefreshCw className={`w-3 h-3 ${rescoreMut.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400 mt-3">
        Scores are calculated based on lead status (30 pts), call history (30 pts), appointments (20 pts), and engagement duration (20 pts).
        Refreshed automatically every hour via the background scheduler.
      </p>
    </DashboardShell>
  );
}
