"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; msg: string };

type ToastApi = {
  toast: (kind: Kind, msg: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast doit être utilisé dans <ToastProvider>");
  return c;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  const push = useCallback((kind: Kind, msg: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((x) => [...x, { id, kind, msg }]);
    const ttl = kind === "error" ? 6000 : 3500;
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), ttl);
  }, []);

  const api: ToastApi = {
    toast: push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-full max-w-sm flex-col gap-2">
        {items.map((t) => {
          const tone =
            t.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : t.kind === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-gray-200 bg-white text-gray-700";
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : Info;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-soft ${tone}`}
              onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}
            >
              <Icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span className="leading-snug">{t.msg}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
