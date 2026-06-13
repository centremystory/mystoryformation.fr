"use client";

/**
 * MYSTORY — Pavé de signature tactile (canvas).
 * Signature tracée au doigt / stylet. Exporte un PNG (data URL) via onChange.
 * `touch-action: none` empêche le défilement de la page pendant qu'on signe.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export default function SignaturePad({
  onChange,
  height = 200,
  disabled = false,
}: {
  onChange?: (dataUrl: string | null) => void;
  height?: number;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [vide, setVide] = useState(true);

  // Initialise la résolution interne du canvas selon sa taille CSS (rendu net en HiDPI).
  const setup = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * ratio);
    cv.height = Math.round(rect.height * ratio);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  useEffect(() => {
    setup();
    const onResize = () => setup();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
    if (vide) setVide(false);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (dirty.current && onChange) onChange(canvasRef.current!.toDataURL("image/png"));
  }

  function effacer() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    dirty.current = false;
    setVide(true);
    onChange?.(null);
  }

  return (
    <div className="w-full">
      <div
        className="relative rounded-xl border-2 border-dashed border-gray-300 bg-white"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="absolute inset-0 h-full w-full rounded-xl"
          style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
        />
        {vide && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Signez ici ✍️
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={effacer}
          disabled={disabled || vide}
          className="text-xs text-gray-600 underline disabled:opacity-40"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
