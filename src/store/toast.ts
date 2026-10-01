"use client";

import { create } from "zustand";

interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast["tone"]) => void;
}

let n = 0;
export const useToast = create<ToastState>()((set) => ({
  toasts: [],
  push: (text, tone = "info") => {
    const id = ++n;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
  },
}));

export const toast = (text: string, tone?: Toast["tone"]) => useToast.getState().push(text, tone);
