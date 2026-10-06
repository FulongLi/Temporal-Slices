import { useEffect } from "react";
import type { TemporalRuntime } from "../scene/runtime";

/**
 * Wheel / trackpad, keyboard and touch-drag input. Everything is translated
 * into navigation moves or state-machine events; nothing here touches 3D.
 */
export function useTemporalInput(runtime: TemporalRuntime, element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return;
    const { store, navigation } = runtime;
    const browsing = () => {
      const mode = store.getState().mode;
      return mode === "observe" || mode === "focus";
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // let pinch-zoom through
      event.preventDefault();
      if (!browsing()) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      // Vertical and horizontal gestures both travel; whichever is larger wins.
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 0.5) return;
      navigation.scroll(delta * unit);
      store.dispatch({ type: "travel" });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const s = store.getState();
      const step = (direction: number) => {
        event.preventDefault();
        if (!browsing()) return;
        if (s.mode === "focus" && s.focus !== null) {
          const next = Math.max(0, Math.min(navigation.max, s.focus + direction));
          navigation.goTo(next);
          store.dispatch({ type: "select", index: next });
        } else {
          navigation.step(direction);
          store.dispatch({ type: "travel" });
        }
      };
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          return step(1);
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          return step(-1);
        case "Home":
        case "End":
          event.preventDefault();
          if (!browsing()) return;
          navigation.goTo(event.key === "Home" ? 0 : navigation.max);
          store.dispatch({ type: "travel" });
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          if (s.mode === "observe" && event.key === " ") {
            store.dispatch({ type: "select", index: s.hover ?? s.present });
            return;
          }
          if (s.mode === "observe" || s.mode === "focus") navigation.goTo(s.focus ?? s.hover ?? s.present);
          store.dispatch({ type: "enter" });
          return;
        case "Escape":
        case "Backspace":
          event.preventDefault();
          store.dispatch({ type: "escape" });
          return;
        case "l":
        case "L": {
          if (!browsing()) return;
          const names = runtime.layouts.map((l) => l.name);
          const next = names[(names.indexOf(s.layout) + 1) % names.length];
          store.dispatch({ type: "layout", name: next });
          return;
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      runtime.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    };

    // Touch: drag to travel.
    let touch: { y: number; x: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1 || !browsing()) return;
      const t = event.touches[0];
      const dx = touch.x - t.clientX;
      const dy = touch.y - t.clientY;
      touch = { x: t.clientX, y: t.clientY };
      navigation.scroll((Math.abs(dy) > Math.abs(dx) ? dy : dx) * 2.2);
      store.dispatch({ type: "travel" });
      event.preventDefault();
    };
    const onTouchEnd = () => {
      touch = null;
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [runtime, element]);
}
