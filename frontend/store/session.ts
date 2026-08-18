// store/session.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  tenantId: string | null;
  userId: string | null;
  role: string | null;
  // Superadmin "View As" — when set, superadmin screens show this
  // specific account's data instead of the superadmin's own scoped view.
  viewAsUserId: string | null;
  viewAsLabel: string | null;
  setSession: (tenantId: string, userId: string, role: string) => void;
  clearSession: () => void;
  setViewAs: (userId: string | null, label: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      tenantId: null,
      userId: null,
      role: null,
      viewAsUserId: null,
      viewAsLabel: null,
      setSession: (tenantId, userId, role) => set({ tenantId, userId, role }),
      clearSession: () => set({ tenantId: null, userId: null, role: null, viewAsUserId: null, viewAsLabel: null }),
      setViewAs: (userId, label) => set({ viewAsUserId: userId, viewAsLabel: label }),
    }),
    { name: "voice-ops-session" }
  )
);
