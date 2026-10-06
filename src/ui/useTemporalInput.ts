import { useEffect } from "react";
import { clamp, stepMoment } from "../engine";
import type { TemporalRuntime } from "../scene/runtime";

/** How far drag and pinch may lean the view away from its resting pose. */
const ORBIT_LIMIT = { yaw: 0.55, pitchUp: 0.32, pitchDown: 0.16, zoomIn: 0.5, zoomOut: 1.3 };
/** Pixels a press may move and still count as a click. */
const CLICK_SLOP = 5;

/**
 * Wheel / trackpad, pointer, keyboard and touch input. Everything is
 * translated into navigation moves, view adjustments or state-machine
 * events; nothing here touches 3D.
 *
 *   wheel           travel through time (pinch: come closer / step back)
 *   drag            lean the view to inspect the block's sides
 *   click           draw the slice under the pointer out of the block
 *   double-click    enter it
 */
export function useTemporalInput(runtime: TemporalRuntime, element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return;
    const { store, navigation, orbit, sampling } = runtime;
    const browsing = () => {
      const mode = store.getState().mode;
      return mode === "observe" || mode === "focus";
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!browsing()) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      if (event.ctrlKey) {
        // Trackpad pinch arrives as ctrl + wheel.
        orbit.zoom = clamp(orbit.zoom * Math.exp(event.deltaY * unit * 0.01), ORBIT_LIMIT.zoomIn, ORBIT_LIMIT.zoomOut);
        return;
      }
      // Vertical and horizontal gestures both travel; whichever is larger wins.
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 0.5) return;
      navigation.scroll(delta * unit);
      store.dispatch({ type: "travel" });
    };

    const focusOn = (index: number) => {
      navigation.goTo(index);
      store.dispatch({ type: "select", index });
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const s = store.getState();
      const step = (direction: number) => {
        event.preventDefault();
        if (!browsing()) return;
        if (s.mode === "focus" && s.focus !== null) {
          // Focused: move the extracted slice through time, one layer at a time.
          focusOn(clamp(s.focus + direction * (event.shiftKey ? 10 : 1), 0, navigation.max));
        } else {
          // Observing: travel from one moment to the next.
          navigation.goTo(stepMoment(sampling, navigation.target, direction));
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
            focusOn(s.hover ?? s.present);
            return;
          }
          if (s.mode === "observe" || s.mode === "focus") navigation.goTo(s.focus ?? s.hover ?? s.present);
          store.dispatch({ type: "enter" });
          return;
        case "Escape":
        case "Backspace":
          event.preventDefault();
          if (s.mode === "observe") {
            orbit.yaw = 0;
            orbit.pitch = 0;
            orbit.zoom = 1;
          }
          store.dispatch({ type: "escape" });
          return;
      }
    };

    const setPointer = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      runtime.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      runtime.pointer.inside = event.pointerType === "mouse" || event.pointerType === "pen";
    };

    let press: { x: number; y: number; id: number; dragging: boolean } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      setPointer(event);
      if (event.button !== 0) return;
      press = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false };
    };
    const onPointerMove = (event: PointerEvent) => {
      setPointer(event);
      if (!press || press.id !== event.pointerId || event.pointerType === "touch") return;
      if (!press.dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP) {
        press.dragging = true;
        element.setPointerCapture(event.pointerId);
        element.classList.add("is-dragging");
      }
      if (press.dragging && browsing()) {
        orbit.yaw = clamp(orbit.yaw - event.movementX * 0.0035, -ORBIT_LIMIT.yaw, ORBIT_LIMIT.yaw);
        orbit.pitch = clamp(orbit.pitch + event.movementY * 0.0025, -ORBIT_LIMIT.pitchDown, ORBIT_LIMIT.pitchUp);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!press || press.id !== event.pointerId) return;
      const wasDrag = press.dragging;
      press = null;
      element.classList.remove("is-dragging");
      if (wasDrag || !browsing()) return;
      const s = store.getState();
      if (s.hover !== null) focusOn(s.hover);
      else if (s.mode === "focus") store.dispatch({ type: "escape" });
    };
    const onPointerLeave = () => {
      runtime.pointer.inside = false;
    };
    const onDoubleClick = () => {
      const s = store.getState();
      const index = s.hover ?? s.focus;
      if (index === null || !browsing()) return;
      navigation.goTo(index);
      store.dispatch({ type: "enter", index });
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
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("dblclick", onDoubleClick);
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("pointerleave", onPointerLeave);
      element.removeEventListener("dblclick", onDoubleClick);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [runtime, element]);
}
