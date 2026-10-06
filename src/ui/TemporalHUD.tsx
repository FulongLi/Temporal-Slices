import { useEffect, useMemo, useRef, useState } from "react";
import { labelAt, phaseSegments } from "../engine";
import { useRuntime, useTemporalState } from "../scene/runtime";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Minimal instrumentation. The running date and the ruler marker update
 * every frame straight into the DOM; everything else re-renders only when
 * the interaction state changes.
 */
export function TemporalHUD() {
  const runtime = useRuntime();
  const { dataset, navigation } = runtime;
  const mode = useTemporalState((s) => s.mode);
  const focus = useTemporalState((s) => s.focus);
  const present = useTemporalState((s) => s.present);
  const interacted = useTemporalState((s) => s.interacted);
  const layoutName = useTemporalState((s) => s.layout);
  const date = useRef<HTMLSpanElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => phaseSegments(dataset), [dataset]);
  const count = dataset.slices.length;

  useEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const label = labelAt(dataset, navigation.position);
      if (label !== last && date.current) {
        date.current.textContent = label;
        last = label;
      }
      if (marker.current) marker.current.style.left = `${(navigation.position / (count - 1)) * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dataset, navigation, count]);

  // The first-run hint leaves after the first movement, or on its own.
  const [hintExpired, setHintExpired] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setHintExpired(true), 9000);
    return () => window.clearTimeout(timer);
  }, []);

  const shown = focus ?? present;
  const slice = dataset.slices[shown];
  const examining = mode !== "observe";
  const inside = mode === "inside" || mode === "entering";
  const layout = runtime.layouts.find((l) => l.name === layoutName);

  let hint = "";
  const intro = mode === "observe" && !interacted && !hintExpired;
  if (intro) hint = "Scroll to move through time";
  else if (mode === "focus") hint = "Enter — step into this moment\nEsc — release";
  else if (mode === "inside") hint = "Esc — return to the archive";
  // Keep the last words on screen while they fade out.
  const [shownHint, setShownHint] = useState({ text: hint, intro });
  useEffect(() => {
    if (hint) setShownHint({ text: hint, intro });
  }, [hint, intro]);

  return (
    <div className={`hud mode-${mode}`}>
      <header className="hud-archive">
        <span className="hud-kicker">Temporal Archive</span>
        <span className="hud-title">{dataset.title}</span>
        {dataset.subtitle && <span className="hud-subtitle">{dataset.subtitle}</span>}
      </header>

      <div className="hud-index" aria-hidden="true">
        <span>
          {pad(shown + 1)} <i>/</i> {pad(count)}
        </span>
        <span className="hud-layout">{layout?.label}</span>
      </div>

      <section className={`hud-moment ${examining ? "is-examining" : ""}`} aria-hidden="true">
        <span className="hud-date" ref={date}>
          {slice.timeLabel}
        </span>
        {slice.phase && <span className="hud-phase">{slice.phase}</span>}
        <div className="hud-detail">
          {slice.title && <h2>{slice.title}</h2>}
          {slice.description && <p>{slice.description}</p>}
          {slice.attributes && (
            <dl>
              {Object.entries(slice.attributes).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <div className={`hud-ruler ${inside ? "is-hidden" : ""}`} aria-hidden="true">
        {segments.map((segment) => (
          <div
            key={`${segment.phase}-${segment.start}`}
            className={`hud-segment ${slice.phase === segment.phase ? "is-current" : ""}`}
            style={{
              left: `${(segment.start / (count - 1)) * 100}%`,
              width: `${((segment.end - segment.start) / (count - 1)) * 100}%`,
            }}
          />
        ))}
        {dataset.slices.map((s, i) => (
          <div key={s.id} className={`hud-tick ${i === focus ? "is-focus" : ""}`} style={{ left: `${(i / (count - 1)) * 100}%` }} />
        ))}
        <div className="hud-marker" ref={marker} />
        <span className="hud-ruler-start">{dataset.slices[0].timeLabel.slice(0, 4)}</span>
        <span className="hud-ruler-end">{dataset.slices[count - 1].timeLabel.slice(0, 4)}</span>
      </div>

      <div className={`hud-hint ${hint ? "is-visible" : ""} ${shownHint.intro ? "is-intro" : ""}`}>
        {shownHint.text}
      </div>

      <p className="visually-hidden" aria-live="polite">
        {`${slice.timeLabel}${slice.phase ? `, ${slice.phase}` : ""}. ${slice.title ?? ""}. ${
          mode === "inside" ? "Inside this moment. Press Escape to return." : mode === "focus" ? "Press Enter to step inside." : ""
        }`}
      </p>
    </div>
  );
}

/** A brief title card while the archive assembles. */
export function TemporalIntro() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setGone(true), 2600);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={`intro ${gone ? "is-gone" : ""}`} aria-hidden="true">
      <span className="intro-title">Temporal Slices</span>
      <span className="intro-line">Time is not a timeline. Time is a space.</span>
    </div>
  );
}
