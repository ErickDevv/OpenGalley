import { useCallback, useRef, useState } from "react";

export function useSplitPane(storageKey: string, initial = 0.5) {
  const [ratio, setRatio] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved > 0 && saved < 1 ? saved : initial;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      let next = ratio;
      const onMove = (ev: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        next = Math.min(0.85, Math.max(0.15, (ev.clientX - rect.left) / rect.width));
        setRatio(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem(storageKey, String(next));
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [ratio, storageKey]
  );

  return { ratio, containerRef, startResize };
}
