import { useEffect, useRef, useState } from "react";
import { sliceLabel } from "../engine";
import { useRuntime, useTemporalState } from "../scene/runtime";

/** Seconds the running date stays after travel stops. */
const TRAVEL_LINGER = 1.4;

/**
 * Almost no interface. At rest only the archive's name remains, faintly.
 * While travelling, the date of the present runs like an odometer and then
 * fades; metadata appears only when a slice has been drawn out of the block.
 * The running values update straight into the DOM every frame; everything
 * else re-renders only when the interaction state changes.
 */
export function TemporalHUD() {
  const runtime = useRuntime();
  const { dataset, navigation, sampling, layout } = runtime;
  const mode = useTemporalState((s) => s.mode);
  const focus = useTemporalState((s) => s.focus);
  const interacted = useTemporalState((s) => s.interacted);
  const root = useRef<HTMLDivElement>(null);
  const date = useRef<HTMLSpanElement>(null);
  const index = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    let lastLabel = "";
    let lastIndex = -1;
    let lastMoved = -Infinity;
    let travelling = false;
    const tick = (now: number) => {
      const position = focus ?? navigation.position;
      const label = sliceLabel(dataset, sampling, position);
      if (label !== lastLabel && date.current) date.current.textContent = lastLabel = label;
      const i = Math.round(position);
      if (i !== lastIndex && index.current) {
        index.current.textContent = `${String(i + 1).padStart(3, "0")} / ${layout.count}`;
        lastIndex = i;
      }
      if (Math.abs(navigation.velocity) > 0.8) lastMoved = now;
      const moving = now - lastMoved < TRAVEL_LINGER * 1000;
      if (moving !== travelling && root.current) {
        travelling = moving;
        root.current.classList.toggle("is-travelling", moving);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dataset, navigation, sampling, layout, focus]);

  // The first-run hint leaves after the first movement, or on its own.
  const [hintExpired, setHintExpired] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setHintExpired(true), 14000);
    return () => window.clearTimeout(timer);
  }, []);

  const moment = focus !== null ? dataset.moments[runtime.momentOf(focus)] : null;
  const examining = mode !== "observe" && moment !== null;

  let hint = "";
  const intro = mode === "observe" && !interacted && !hintExpired;
  if (intro) hint = "Scroll to travel through time · Click to draw out a moment";
  else if (mode === "focus") hint = "Enter — step inside\n← → — move through time\nEsc — release";
  else if (mode === "inside") hint = "Esc — return to the archive";
  // Keep the last words on screen while they fade out.
  const [shownHint, setShownHint] = useState({ text: hint, intro });
  useEffect(() => {
    if (hint) setShownHint({ text: hint, intro });
  }, [hint, intro]);

  return (
    <div ref={root} className={`hud mode-${mode} ${examining ? "is-examining" : ""}`}>
      <header className="hud-archive">
        <span className="hud-kicker">Temporal Archive</span>
        <span className="hud-title">{dataset.title}</span>
      </header>

      <section className="hud-moment" aria-hidden="true">
        <span className="hud-date" ref={date} />
        <span className="hud-index">
          Slice <span ref={index} />
        </span>
        <div className="hud-detail">
          {moment?.phase && <span className="hud-phase">{moment.phase}</span>}
          {moment?.title && <h2>{moment.title}</h2>}
          {moment?.description && <p>{moment.description}</p>}
          {moment?.attributes && (
            <dl>
              {Object.entries(moment.attributes).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <div className={`hud-hint ${hint ? "is-visible" : ""} ${shownHint.intro ? "is-intro" : ""}`}>{shownHint.text}</div>

      <p className="visually-hidden" aria-live="polite">
        {moment
          ? `${moment.timeLabel}${moment.phase ? `, ${moment.phase}` : ""}. ${moment.title ?? ""}. ${
              mode === "inside" ? "Inside this moment. Press Escape to return." : "Press Enter to step inside."
            }`
          : ""}
      </p>
    </div>
  );
}

/** A brief title card while the volume assembles. */
export function TemporalIntro() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setGone(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={`intro ${gone ? "is-gone" : ""}`} aria-hidden="true">
      <span className="intro-title">Temporal Slices</span>
      <span className="intro-line">Time is not a timeline. Time is a space.</span>
    </div>
  );
}
