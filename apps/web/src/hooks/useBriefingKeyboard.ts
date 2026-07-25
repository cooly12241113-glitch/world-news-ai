import { useEffect } from "react";

export function useBriefingKeyboard(actions: {
  toggle: () => void; previous: () => void; next: () => void; close: () => void;
}) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement) return;
      if (event.code === "Space") { event.preventDefault(); actions.toggle(); }
      else if (event.key === "ArrowLeft") actions.previous();
      else if (event.key === "ArrowRight") actions.next();
      else if (event.key === "Escape") actions.close();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [actions]);
}
