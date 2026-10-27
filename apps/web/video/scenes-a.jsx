/* global React */
// Pulse demo — scenes 1–4 (cold open · the shift · copilot describe · approve+draft).
(function () {
  const { useSprite, Easing, clamp, interpolate } = window;
  const P = window.PV;
  const { INK, MUT, BORDER, ACCENT, SANS, MONO } = P;

  const card = (extra) => ({ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, ...extra });
  const frameRing = '0 0 0 1px rgba(228,228,231,1), 0 1px 2px rgba(9,9,11,.04), 0 24px 60px -20px rgba(9,9,11,.18)';

  // Small mouse cursor pointer.
  function Cursor({ x, y, pressed }) {
    return (
      <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-2px,-2px) scale(${pressed ? 0.85 : 1})`, transition: 'none', zIndex: 50, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))', willChange: 'transform' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#09090b" stroke="#fff" strokeWidth="1.5">
          <path d="M5 3l5.5 15 2.2-6.3 6.3-2.2L5 3z" />
        </svg>
      </div>
    );
  }

  /* ───────────────── Scene 1 · Cold open ───────────────── */
  function ColdOpen() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.6);
    const markP = Easing.easeOutCubic(clamp(localTime / 0.8, 0, 1));
    const drift = 1 + Easing.easeInOutSine(clamp(localTime / 6.5, 0, 1)) * 0.015;
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: op, transform: `scale(${drift})` }}>
        <div style={{ opacity: markP, transform: `translateY(${(1 - markP) * 14}px)`, filter: `blur(${(1 - markP) * 8}px)`, marginBottom: 54 }}>
          <P.PulseMark size={84} />
        </div>
        <P.WordRise localTime={localTime} start={0.9} stagger={0.12} dur={0.8} size={86} lineHeight={1.08}
          words={[
            { text: 'Describe' }, { text: 'the' }, { text: 'audience.' }, { br: true },
            { text: 'Pulse' }, { text: 'runs' }, { text: 'the' }, { text: 'campaign.', serif: true, tight: true },
          ]} />
      </div>
    );
  }

  /* ───────────────── Scene 2 · The shift ───────────────── */
  function TheShift() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.6);
    // old form: visible 0..2.4, dissolves 2.4..4.0
    const formOut = Easing.easeInCubic(clamp((localTime - 2.4) / 1.6, 0, 1));
    const formOpacity = (1 - formOut) * 0.55;
    // clean input: fades in 3.0..4.2
    const inP = Easing.easeOutCubic(clamp((localTime - 3.0) / 1.2, 0, 1));
    const capOp = Easing.easeOutCubic(clamp((localTime - 1.0) / 0.7, 0, 1)) * (1 - Easing.easeInCubic(clamp((localTime - 6.6) / 0.6, 0, 1)));

    const rows = ['Order count', 'Total spend', 'Last order', 'City', 'Tags', 'Lifetime value'];
    return (
      <div style={{ position: 'absolute', inset: 0, opacity: op }}>
        {/* cluttered, greyed form */}
        <div style={{ position: 'absolute', left: '50%', top: 250, transform: `translateX(-50%) scale(${1 - formOut * 0.06})`, opacity: formOpacity, filter: `blur(${formOut * 10}px) grayscale(1)`, ...card({ padding: 28, width: 720 }) }}>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: MUT, marginBottom: 18 }}>New segment · build by hand</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {rows.map((r) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${BORDER}`, background: '#f4f4f5' }} />
                <span style={{ fontFamily: SANS, fontSize: 13, color: MUT, width: 92 }}>{r}</span>
                <span style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* the single clean input it becomes */}
        <div style={{ position: 'absolute', left: '50%', top: 470, transform: `translate(-50%, ${(1 - inP) * 16}px)`, opacity: inP, width: 760 }}>
          <div style={{ ...card({ padding: '22px 24px' }), boxShadow: frameRing, display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
            <span style={{ fontFamily: SANS, fontSize: 22, color: '#a1a1aa' }}>Describe the audience you want to reach…</span>
          </div>
        </div>

        <P.Caption opacity={capOp} parts={[
          { text: 'Most CRMs make you build the audience by hand. ' },
          { text: 'Pulse starts with a sentence.', strong: true },
        ]} />
      </div>
    );
  }

  /* ───────────────── Scene 3 · Copilot — describe it ───────────────── */
  function CopilotDescribe() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.6);
    const promptText = "Win back customers who spent over ₹2,000 but haven't ordered in 60 days.";
    const shown = P.typed(promptText, localTime, 0.7, 24);
    const typingDone = localTime > 0.7 + promptText.length / 24;
    const thinking = localTime > 3.6 && localTime < 5.1;
    const showRules = localTime > 5.2;
    const caret = Math.floor(localTime * 2) % 2 === 0;

    const chip = (active) => ({ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#fff', border: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 19, color: INK, whiteSpace: 'nowrap' });
    const rule = (i) => {
      const t = clamp((localTime - (5.4 + i * 0.55)) / 0.6, 0, 1);
      const e = Easing.easeOutCubic(t);
      return { opacity: e, transform: `translateY(${(1 - e) * 10}px)`, filter: `blur(${(1 - e) * 4}px)` };
    };
    const count = Math.round(P.countTo(localTime, 1284, 6.4, 1.4));
    const capOp = Easing.easeOutCubic(clamp((localTime - 1.4) / 0.7, 0, 1)) * (1 - Easing.easeInCubic(clamp((localTime - 14.8) / 0.6, 0, 1)));

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: op }}>
        <div style={{ position: 'absolute', left: '50%', top: 150, transform: 'translateX(-50%)', width: 880 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 999, border: `1px solid ${BORDER}`, fontFamily: SANS, fontSize: 16, fontWeight: 500, color: MUT, marginBottom: 22 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
            Campaign Copilot
          </div>

          {/* composer */}
          <div className={thinking ? 'pulse-ai-thinking' : ''} style={{ ...card({ padding: '26px 28px' }), borderRadius: 20, boxShadow: frameRing, minHeight: 96 }}>
            <span style={{ fontFamily: SANS, fontSize: 26, lineHeight: 1.5, color: INK }}>
              {shown}{!typingDone && <span style={{ opacity: caret ? 1 : 0, color: ACCENT }}>|</span>}
            </span>
          </div>

          {/* proposed rules + count */}
          {showRules && (
            <div style={{ marginTop: 22, ...card({ padding: 24 }), background: '#fafafb' }}>
              <div style={{ fontFamily: SANS, fontSize: 17, color: MUT, marginBottom: 16 }}>
                Customers who match <b style={{ color: INK, fontWeight: 600 }}>all</b> of these:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <span style={{ ...chip(), ...rule(0), flexShrink: 0 }}>total_spend <span style={{ color: MUT }}>&gt;</span> ₹2,000</span>
                <span style={{ ...chip(), ...rule(1), flexShrink: 0 }}>last_order_at <span style={{ color: MUT }}>&gt;</span> 60&nbsp;days</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 24 }}>
                <span style={{ fontFamily: SANS, fontSize: 46, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: INK }}>{count.toLocaleString()}</span>
                <span style={{ fontFamily: SANS, fontSize: 20, color: MUT }}>customers match</span>
              </div>
            </div>
          )}
        </div>

        <P.Caption opacity={capOp} parts={[
          { text: 'Plain language in. Pulse proposes ' },
          { text: 'validated rules — and a live count', strong: true },
          { text: ' — before anything sends.' },
        ]} />
      </div>
    );
  }

  /* ───────────────── Scene 4 · Approve + draft ───────────────── */
  function ApproveDraft() {
    const { localTime } = useSprite();
    const op = P.useFade(0.5, 0.6);

    // cursor path: move to the spend value (~0.4-2.0), then to Approve (~5.0-6.0)
    const cx = interpolate([0, 0.7, 2.2, 4.6, 6.0], [820, 430, 430, 760, 1320], Easing.easeInOutCubic)(localTime);
    const cy = interpolate([0, 0.7, 2.2, 4.6, 6.0], [760, 450, 450, 620, 786], Easing.easeInOutCubic)(localTime);
    const editing = localTime > 1.6 && localTime < 2.6;
    const spend = localTime < 2.0 ? '2,000' : '2,500';
    const pressed = localTime > 6.0 && localTime < 6.25;
    const approved = localTime > 6.25;

    // message types in 2.6..5.0
    const msg = 'Hi Asha, your usual roast misses you — 15% off this week ☕';
    const msgShown = P.typed(msg, localTime, 2.8, 30);
    const phoneP = Easing.easeOutCubic(clamp((localTime - 2.3) / 0.7, 0, 1));
    const capOp = Easing.easeOutCubic(clamp((localTime - 1.0) / 0.7, 0, 1)) * (1 - Easing.easeInCubic(clamp((localTime - 10.6) / 0.6, 0, 1)));

    const chipBase = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 8, background: '#fff', border: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 19, color: INK, whiteSpace: 'nowrap' };

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: op }}>
        {/* left: editable rules */}
        <div style={{ position: 'absolute', left: 250, top: 360, width: 560 }}>
          <div style={{ fontFamily: SANS, fontSize: 17, color: MUT, marginBottom: 18 }}>Editable rules — your edits always win.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <span style={chipBase}>order_count <span style={{ color: MUT }}>≥</span> 2</span>
            <span style={{ ...chipBase, borderColor: editing ? ACCENT : BORDER, boxShadow: editing ? `0 0 0 3px ${ACCENT}28` : 'none' }}>
              total_spend <span style={{ color: MUT }}>&gt;</span> ₹{spend}{editing && <span style={{ color: ACCENT }}>|</span>}
            </span>
            <span style={chipBase}>last_order_at <span style={{ color: MUT }}>&gt;</span> 60&nbsp;days</span>
          </div>
        </div>

        {/* right: phone frame with drafted message */}
        <div style={{ position: 'absolute', left: 1140, top: 250, width: 360, height: 580, opacity: phoneP, transform: `translateY(${(1 - phoneP) * 16}px)` }}>
          <div style={{ width: 360, height: 580, borderRadius: 40, background: '#fff', boxShadow: frameRing, padding: 14, boxSizing: 'border-box' }}>
            <div style={{ height: '100%', borderRadius: 28, background: '#fafafb', border: `1px solid ${BORDER}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ width: 34, height: 34, borderRadius: 999, background: '#18181b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>AK</span>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK }}>Asha Kulkarni</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUT }}>WhatsApp · +91 ·····</div>
                </div>
              </div>
              <div style={{ padding: 18, flex: 1 }}>
                <div style={{ maxWidth: 270, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, borderTopLeftRadius: 4, padding: '12px 14px', fontFamily: SANS, fontSize: 16, lineHeight: 1.5, color: INK }}>
                  {msgShown}
                </div>
              </div>
              {/* approve button */}
              <div style={{ padding: 18 }}>
                <div style={{ height: 46, borderRadius: 10, background: approved ? '#059669' : '#18181b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: SANS, fontSize: 16, fontWeight: 500, transform: `scale(${pressed ? 0.97 : 1})`, transition: 'none' }}>
                  {approved
                    ? <React.Fragment><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Approved</React.Fragment>
                    : 'Approve & queue'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Cursor x={cx} y={cy} pressed={pressed} />

        <P.Caption opacity={capOp} parts={[
          { text: 'You see it, edit it, approve it. ' },
          { text: 'No black-box autonomy.', strong: true },
        ]} />
      </div>
    );
  }

  window.PulseScenesA = { ColdOpen, TheShift, CopilotDescribe, ApproveDraft, Cursor };
})();
