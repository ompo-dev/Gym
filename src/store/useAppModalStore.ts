import { create } from 'zustand';

import type { AppModal, AppModalId } from '@/core/appModals';

interface AppModalState {
  stack: AppModal[];
  openAppModal: (modal: AppModal) => void;
  replaceAppModal: (modal: AppModal) => void;
  closeAppModal: (id?: AppModalId) => void;
  closeAllAppModals: () => void;
}

export const useAppModalStore = create<AppModalState>((set) => ({
  stack: [],

  openAppModal: (modal) =>
    set((state) => ({
      stack: [...state.stack, modal],
    })),

  replaceAppModal: (modal) =>
    set((state) => ({
      stack: state.stack.length ? [...state.stack.slice(0, -1), modal] : [modal],
    })),

  closeAppModal: (id) =>
    set((state) => {
      const active = state.stack.at(-1);
      if (!active || (id && active.id !== id)) return state;
      return { stack: state.stack.slice(0, -1) };
    }),

  closeAllAppModals: () => set({ stack: [] }),
}));

