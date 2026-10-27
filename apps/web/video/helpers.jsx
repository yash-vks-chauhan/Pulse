/* global React */
// Pulse demo — shared helpers + small reusable visual atoms. All pull from the
// Pulse design system (tokens via styles.css). Exposed on window for scenes.
(function () {
  const { useSprite, Easing, clamp } = window;
  const INK = '#09090b', MUT = '#71717a', BORDER = '#e4e4e7', ACCENT = '#2563eb';
  const SANS = "'Geist', system-ui, sans-serif";
  const MONO = "'Geist Mono', ui-monospace, monospace";

  // Scene opacity envelope — fade in, hold, fade out (based on local time).
  function useFade(entry = 0.6, exit = 0.5) {
    const { localTime, duration } = useSprite();
    if (localTime < entry) return Easing.easeOutCubic(clamp(localTime / entry, 0, 1));
    if (localTime > duration - exit) return 1 - Easing.easeInCubic(clamp((localTime - (duration - exit)) / exit, 0, 1));
    return 1;
  }

  // Count a number up from 0 to `value`, starting at `start`s over `dur`s.
  function countTo(localTime, value, start = 0, dur = 1.3, ease = Easing.easeOutExpo) {
    return value * ease(clamp((localTime - start) / dur, 0, 1));
  }

  // The Pulse waveform mark in a rounded ink tile.
  function PulseMark({ size = 64, style }) {
    return (
      <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, borderRadius: size * 0.25, background: '#18181b', color: '#fafafa', alignItems: 'center', justifyContent: 'center', ...style }}>
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 12h4l2.5-6.5 4.5 13 2.5-6.5h5.5" />
        </svg>
      </span>
    );
  }

  // The full lockup (mark + "Pulse").
  function PulseLogo({ size = 40, word = 22 }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.28 }}>
        <PulseMark size={size} />
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: word, letterSpacing: '-0.01em', color: INK }}>Pulse</span>
      </span>
    );
  }

  // Word-by-word rising headline. `words` = [{ text, serif? }]. Each word rises
  // + de-blurs on the Pulse easing, staggered.
  function WordRise({ words, localTime, start = 0, stagger = 0.11, dur = 0.75, size = 64, color = INK, weight = 600, lineHeight = 1.1, align = 'center', style }) {
    return (
      <div style={{ fontFamily: SANS, fontSize: size, fontWeight: weight, letterSpacing: '-0.01em', lineHeight, color, textAlign: align, ...style }}>
        {words.map((w, i) => {
          if (w.br) return <br key={i} />;
          const local = localTime - (start + i * stagger);
          const p = clamp(local / dur, 0, 1);
          const e = Easing.easeOutCubic(p);
          return (
            <span key={i} style={{
              display: 'inline-block',
              opacity: e,
              transform: `translateY(${(1 - e) * 0.5}em)`,
              filter: `blur(${(1 - e) * 7}px)`,
              fontFamily: w.serif ? "'Instrument Serif', Georgia, serif" : SANS,
              fontStyle: w.serif ? 'italic' : 'normal',
              fontWeight: w.serif ? 400 : weight,
              color: w.color || color,
              marginRight: w.tight ? 0 : '0.28em',
              willChange: 'transform, opacity, filter',
            }}>{w.text}</span>
          );
        })}
      </div>
    );
  }

  // Bottom-centered narration caption. opacity passed in (scene-controlled).
  function Caption({ parts, opacity = 1, y = 980 }) {
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, top: y, display: 'flex', justifyContent: 'center', opacity, transition: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 1180, padding: '0 40px' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT, flexShrink: 0 }} />
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 25, lineHeight: 1.5, color: MUT, letterSpacing: '-0.005em' }}>
            {parts.map((p, i) => (
              <span key={i} style={p.strong ? { color: INK, fontWeight: 500 } : null}>{p.text}</span>
            ))}
          </p>
        </div>
      </div>
    );
  }

  // A simple typed-text helper: returns the visible substring for a typing effect.
  function typed(text, localTime, start, cps = 26) {
    const n = clamp(Math.floor((localTime - start) * cps), 0, text.length);
    return text.slice(0, n);
  }

  window.PV = { INK, MUT, BORDER, ACCENT, SANS, MONO, useFade, countTo, PulseMark, PulseLogo, WordRise, Caption, typed };
})();
