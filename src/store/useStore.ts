import { create } from "zustand";
import type { Profile } from "../types";

interface UIState {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  customerSearch: string;
  setCustomerSearch: (q: string) => void;
  showUpgradeModal: boolean;
  setShowUpgradeModal: (v: boolean) => void;
}

export const useStore = create<UIState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  customerSearch: "",
  setCustomerSearch: (customerSearch) => set({ customerSearch }),
  showUpgradeModal: false,
  setShowUpgradeModal: (showUpgradeModal) => set({ showUpgradeModal }),
}));
