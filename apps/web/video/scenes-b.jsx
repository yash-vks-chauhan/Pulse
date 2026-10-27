/* global React */
// Pulse demo — scenes 5–7 (execute pipeline · measure insights · close).
(function () {
  const { useSprite, Easing, clamp, interpolate } = window;
  const P = window.PV;
  const { INK, MUT, BORDER, ACCENT, SANS, MONO } = P;
  const SUCCESS = '#059669', ERROR = '#dc2626', VIOLET = '#8b5cf6';
  const frameRing = '0 0 0 1px rgba(228,228,231,1), 0 1px 2px rgba(9,9,11,.04), 0 24px 60px -20px rgba(9,9,11,.18)';
  const card = (extra) => ({ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, ...extra });

  /* ───────────────── Scene 5 · Execute — the pipeline (hero) ───────────────── */
  function Pipeline() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.6);
    const lanes = [
      { name: 'WhatsApp', y: 196 },
      { name: 'SMS', y: 276 },
      { name: 'Email', y: 356 },
      { name: 'RCS', y: 436 },
    ];
    const x0 = 430, x1 = 1520;
    const laneIn = Easing.easeOutCubic(clamp(localTime / 0.7, 0, 1));

    // ambient flowing dots per lane
    function dots(laneY, speed, offset, color) {
      const out = [];
      for (let i = 0; i < 5; i++) {
        const span = x1 - x0 - 40;
        const prog = ((localTime * speed + offset + i * 0.21) % 1);
        const x = x0 + 20 + prog * span;
        out.push(<span key={i} style={{ position: 'absolute', left: x, top: laneY + 22, width: 9, height: 9, borderRadius: 999, background: color, opacity: 0.45 }} />);
      }
      return out;
    }

    // hero token: WhatsApp until 4.0 (fails), reroute to SMS, succeeds ~6.6
    const failAt = 4.0;
    const heroX = interpolate([1.0, failAt, 5.2, 6.6], [x0 + 20, 900, 900, x1 - 60], Easing.easeInOutCubic)(localTime);
    const failed = localTime >= failAt && localTime < 5.2;
    const onSms = localTime >= 5.2;
    const heroY = onSms ? lanes[1].y + 22 : lanes[0].y + 22;
    const succeeded = localTime > 6.4;
    // reroute connector draw 4.3..5.2
    const rerouteP = Easing.easeInOutCubic(clamp((localTime - 4.3) / 0.9, 0, 1));

    // funnel stages fill in sequence
    const STAGES = [
      { k: 'QUEUED', c: '#a1a1aa', at: 2.0 },
      { k: 'SENT', c: 'rgba(9,9,11,.7)', at: 2.9 },
      { k: 'DELIVERED', c: ACCENT, at: 4.0 },
      { k: 'OPENED', c: VIOLET, at: 7.2 },
      { k: 'READ', c: VIOLET, at: 8.2 },
      { k: 'CLICKED', c: SUCCESS, at: 9.2 },
      { k: 'CONVERTED', c: '#047857', at: 10.2 },
    ];
    const capOp = Easing.easeOutCubic(clamp((localTime - 1.4) / 0.7, 0, 1)) * (1 - Easing.easeInCubic(clamp((localTime - 14.6) / 0.6, 0, 1)));

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: op }}>
        <div style={{ position: 'absolute', left: 250, top: 110, fontFamily: MONO, fontSize: 14, letterSpacing: '.12em', textTransform: 'uppercase', color: MUT }}>Delivery pipeline</div>

        {/* lanes */}
        {lanes.map((l, li) => (
          <div key={l.name} style={{ opacity: laneIn }}>
            <div style={{ position: 'absolute', left: 250, top: l.y + 12, fontFamily: SANS, fontSize: 19, fontWeight: 500, color: INK, width: 150 }}>{l.name}</div>
            <div style={{ position: 'absolute', left: x0, top: l.y + 26, width: x1 - x0, height: 2, background: BORDER }} />
            {dots(l.y, 0.12 + li * 0.02, li * 0.3, li === 0 ? '#a1a1aa' : '#c4c4c8')}
          </div>
        ))}

        {/* reroute connector WhatsApp → SMS */}
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, pointerEvents: 'none' }}>
          <path d={`M 900 ${lanes[0].y + 26} C 900 ${lanes[0].y + 70}, 900 ${lanes[1].y - 18}, 900 ${lanes[1].y + 26}`}
            fill="none" stroke={ACCENT} strokeWidth="3" strokeDasharray="6 6"
            style={{ strokeDashoffset: 200 * (1 - rerouteP), opacity: rerouteP > 0.02 && localTime < 6.8 ? 1 : 0 }} />
        </svg>

        {/* hero token */}
        {localTime > 0.9 && (
          <div style={{ position: 'absolute', left: heroX, top: heroY - 4, transform: 'translateX(-50%)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: succeeded ? SUCCESS : failed ? ERROR : INK, boxShadow: `0 0 0 5px ${(succeeded ? SUCCESS : failed ? ERROR : INK)}22`, transition: 'none' }}>
              {succeeded && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
            </span>
            {failed && <span style={{ position: 'absolute', left: 24, top: -2, fontFamily: MONO, fontSize: 14, color: ERROR, whiteSpace: 'nowrap' }}>FAILED</span>}
            {onSms && localTime < 6.9 && <span style={{ position: 'absolute', left: -150, top: -2, fontFamily: MONO, fontSize: 14, color: ACCENT, whiteSpace: 'nowrap' }}>failover →</span>}
          </div>
        )}

        {/* funnel stage fill */}
        <div style={{ position: 'absolute', left: 250, top: 600, right: 250 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {STAGES.map((s) => {
              const grow = Easing.easeOutCubic(clamp((localTime - s.at) / 0.8, 0, 1));
              return (
                <div key={s.k} style={{ flex: 1 }}>
                  <div style={{ height: 14, borderRadius: 999, background: '#f4f4f5', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${grow * 100}%`, background: s.c, borderRadius: 999 }} />
                  </div>
                  <div style={{ marginTop: 9, fontFamily: MONO, fontSize: 13, letterSpacing: '.04em', color: grow > 0.3 ? INK : '#c4c4c8', textAlign: 'center', transition: 'none' }}>{s.k}</div>
                </div>
              );
            })}
          </div>
        </div>

        <P.Caption opacity={capOp} y={870} parts={[
          { text: 'Pulse delivers across four channels — and when a vendor fails, ' },
          { text: 'it reroutes automatically.', strong: true },
        ]} />
      </div>
    );
  }

  /* ───────────────── Scene 6 · Measure — insights ───────────────── */
  function Insights() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.6);
    const del = Math.round(P.countTo(localTime, 98, 1.0, 1.4));
    const resc = Math.round(P.countTo(localTime, 214, 1.2, 1.5));
    const rev = P.countTo(localTime, 1.84, 1.4, 1.6);
    const meter = Easing.easeOutCubic(clamp((localTime - 1.0) / 1.4, 0, 1)) * 98;

    const channels = [{ n: 'WhatsApp', v: 62, c: ERROR }, { n: 'SMS', v: 96, c: SUCCESS }, { n: 'Email', v: 99, c: ACCENT }];
    const summary = 'WhatsApp stalled at 62%; failover moved 214 messages to SMS, recovering ₹38,400. Recommend SMS as primary for this audience.';
    const summShown = P.typed(summary, localTime, 3.2, 34);
    const btnP = Easing.easeOutCubic(clamp((localTime - 7.4) / 0.6, 0, 1));
    const capOp = Easing.easeOutCubic(clamp((localTime - 1.2) / 0.7, 0, 1)) * (1 - Easing.easeInCubic(clamp((localTime - 10.6) / 0.6, 0, 1)));

    const tile = (label, value, sub) => (
      <div style={{ flex: 1, padding: '22px 24px', borderRight: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: MUT }}>{label}</div>
        <div style={{ fontFamily: SANS, fontSize: 38, fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: INK, marginTop: 10 }}>{value}</div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: MUT, marginTop: 4 }}>{sub}</div>
      </div>
    );

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: op }}>
        <div style={{ position: 'absolute', left: 250, top: 150 }}>
          <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: '.12em', textTransform: 'uppercase', color: MUT }}>Campaign insights</div>
          <div style={{ fontFamily: SANS, fontSize: 38, fontWeight: 600, letterSpacing: '-0.01em', color: INK, marginTop: 8 }}>Monsoon Malabar — the whole funnel</div>
        </div>

        {/* signal band */}
        <div style={{ position: 'absolute', left: 250, top: 290, right: 250, ...card({ borderRadius: 18 }), boxShadow: frameRing, display: 'grid', gridTemplateColumns: '1fr 2fr', overflow: 'hidden' }}>
          <div style={{ padding: '26px 30px', borderRight: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: MUT }}>Delivery rate</div>
            <div style={{ fontFamily: SANS, fontSize: 60, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: INK, marginTop: 8 }}>{del}%</div>
            <div style={{ height: 8, borderRadius: 999, background: '#f4f4f5', overflow: 'hidden', marginTop: 12 }}>
              <div style={{ height: '100%', width: `${meter}%`, background: SUCCESS, borderRadius: 999 }} />
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: MUT, marginTop: 12, lineHeight: 1.5 }}>Held under 6% vendor failure — retries, the DLQ, and failover absorb the rest.</div>
          </div>
          <div style={{ display: 'flex' }}>
            {tile('Rescued by failover', resc.toLocaleString(), 'WhatsApp → SMS')}
            {tile('Attributed revenue', '₹' + rev.toFixed(2) + 'L', 'last-touch, 72h window')}
            <div style={{ flex: 1, padding: '22px 24px' }}>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: MUT, marginBottom: 12 }}>Per channel</div>
              {channels.map((ch) => {
                const w = Easing.easeOutCubic(clamp((localTime - 1.4) / 1.2, 0, 1)) * ch.v;
                return (
                  <div key={ch.n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: MUT, width: 66 }}>{ch.n}</span>
                    <span style={{ flex: 1, height: 6, borderRadius: 999, background: '#f4f4f5', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${w}%`, background: ch.c, borderRadius: 999 }} /></span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: ch.c, width: 34, textAlign: 'right' }}>{Math.round(w)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* AI summary + button */}
        <div style={{ position: 'absolute', left: 250, top: 560, right: 250, ...card({ borderRadius: 14, padding: '20px 24px', background: 'rgba(37,99,235,.04)', borderColor: 'rgba(37,99,235,.25)' }), minHeight: 92 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: ACCENT, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
            AI summary
          </div>
          <div style={{ fontFamily: SANS, fontSize: 19, lineHeight: 1.5, color: INK }}>{summShown}</div>
        </div>
        <div style={{ position: 'absolute', left: 250, top: 700, opacity: btnP, transform: `translateY(${(1 - btnP) * 8}px)` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 48, padding: '0 22px', borderRadius: 10, background: '#18181b', color: '#fff', fontFamily: SANS, fontSize: 16, fontWeight: 500 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
            Launch follow-up
          </div>
        </div>

        <P.Caption opacity={capOp} y={880} parts={[
          { text: 'It measures the whole funnel, attributes the revenue, and ' },
          { text: 'tells you what to do next.', strong: true },
        ]} />
      </div>
    );
  }

  /* ───────────────── Scene 7 · Close ───────────────── */
  function Close() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.7);
    const nodes = [
      { t: 'AI', s: 'proposes' },
      { t: 'Human', s: 'approves' },
      { t: 'System', s: 'executes' },
      { t: 'AI', s: 'observes' },
    ];
    // loop draws 0.4..4.2, then fades out 4.6..5.4
    const loopOut = 1 - Easing.easeInCubic(clamp((localTime - 4.6) / 0.8, 0, 1));
    const lineP = Easing.easeInOutCubic(clamp((localTime - 0.5) / 3.2, 0, 1));
    // logo resolve from 5.2
    const logoP = Easing.easeOutCubic(clamp((localTime - 5.2) / 0.8, 0, 1));

    const cx = 360, gap = 400;
    return (
      <div style={{ position: 'absolute', inset: 0, opacity: op }}>
        {/* the loop */}
        <div style={{ position: 'absolute', inset: 0, opacity: loopOut }}>
          <div style={{ position: 'absolute', left: cx, top: 470, width: gap * 3, height: 2, background: BORDER }} />
          <div style={{ position: 'absolute', left: cx, top: 470, width: gap * 3 * lineP, height: 2, background: `linear-gradient(to right, rgba(9,9,11,.55), rgba(37,99,235,.6))` }} />
          {nodes.map((n, i) => {
            const at = 0.6 + i * 0.7;
            const np = Easing.easeOutBack(clamp((localTime - at) / 0.5, 0, 1));
            const x = cx + i * gap;
            return (
              <div key={i} style={{ position: 'absolute', left: x, top: 470, transform: `translate(-50%,-50%) scale(${clamp(np, 0, 1.2)})`, opacity: clamp(np, 0, 1) }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, background: '#18181b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 6px #fff' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[i]}</svg>
                </div>
                <div style={{ position: 'absolute', left: '50%', top: 72, transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: INK }}>{n.t}</div>
                  <div style={{ fontFamily: SANS, fontSize: 16, color: MUT, marginTop: 2 }}>{n.s}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* resolve to logo */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: logoP, transform: `translateY(${(1 - logoP) * 12}px)` }}>
          <P.PulseLogo size={56} word={32} />
          <div style={{ marginTop: 40 }}>
            <P.WordRise localTime={localTime} start={5.6} stagger={0.1} dur={0.7} size={62}
              words={[{ text: 'Everything' }, { text: 'between' }, { text: 'intent' }, { text: 'and' }, { text: 'impact.', serif: true, tight: true }]} />
          </div>
          <div style={{ marginTop: 26, fontFamily: SANS, fontSize: 21, color: MUT, opacity: Easing.easeOutCubic(clamp((localTime - 6.8) / 0.7, 0, 1)) }}>
            Pulse — AI-native campaign copilot.
          </div>
        </div>
      </div>
    );
  }

  const ICONS = [
    <path key="a" d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
    <path key="b" d="M20 6 9 17l-5-5" />,
    [<path key="b1" d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />, <path key="b2" d="m21.854 2.147-10.94 10.939" />],
    [<path key="c1" d="M16 7h6v6" />, <path key="c2" d="m22 7-8.5 8.5-5-5L2 17" />],
  ];

  window.PulseScenesB = { Pipeline, Insights, Close };
})();
