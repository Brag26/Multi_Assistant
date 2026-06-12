// store/session.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  tenantId: string | null;
  userId: string | null;
  role: string | null;
  setSession: (tenantId: string, userId: string, role: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      tenantId: null,
      userId: null,
      role: null,
      setSession: (tenantId, userId, role) => set({ tenantId, userId, role }),
      clearSession: () => set({ tenantId: null, userId: null, role: null }),
    }),
    { name: "voice-ops-session" }
  )
);
