"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { listNotifications, markAllNotificationsRead, markNotificationsRead, type Notification } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  tenantId: string;
  compact?: boolean;
}

const typeIcon: Record<string, React.ReactNode> = {
  info:    <Info className="w-4 h-4 text-blue-500" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  error:   <AlertCircle className="w-4 h-4 text-red-500" />,
  success: <CheckCircle className="w-4 h-4 text-emerald-500" />,
};

const typeBorder: Record<string, string> = {
  info:    "border-l-blue-400",
  warning: "border-l-amber-400",
  error:   "border-l-red-400",
  success: "border-l-emerald-400",
};

export function NotificationCenter({ tenantId, compact }: Props) {
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications", tenantId],
    queryFn: () => listNotifications(tenantId, false),
    enabled: Boolean(tenantId),
    refetchInterval: 15_000,
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(tenantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", tenantId] }),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => markNotificationsRead(tenantId, [id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", tenantId] }),
  });

  const unread = notifications.filter(n => !n.read).length;
  const displayed = compact ? notifications.slice(0, 8) : notifications;

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" /> Notifications
            {unread > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{unread}</span>
            )}
          </h2>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={() => markAllMut.mutate()} className="gap-1 text-xs">
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>
      )}

      {compact && unread > 0 && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => markAllMut.mutate()} className="gap-1 text-xs h-6 px-2">
            <CheckCheck className="w-3 h-3" /> All read
          </Button>
        </div>
      )}

      {displayed.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-slate-400 text-sm">
            No notifications
          </CardContent>
        </Card>
      )}

      <div className="space-y-1.5">
        {displayed.map(n => (
          <div
            key={n.id}
            className={`border-l-4 ${typeBorder[n.type]} ${n.read ? "opacity-60" : ""} bg-white rounded-r-lg px-3 py-2.5 shadow-sm border border-l-[4px] cursor-pointer hover:bg-slate-50 transition-colors`}
            onClick={() => { if (!n.read) markOneMut.mutate(n.id); }}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{typeIcon[n.type]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              {!n.read && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Bell icon with badge for shell header
export function NotificationBell({ tenantId }: { tenantId: string }) {
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications", tenantId],
    queryFn: () => listNotifications(tenantId, true),
    enabled: Boolean(tenantId),
    refetchInterval: 15_000,
  });

  const unread = notifications.length;

  return (
    <div className="relative">
      <Bell className="w-5 h-5 text-slate-500" />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </div>
  );
}
