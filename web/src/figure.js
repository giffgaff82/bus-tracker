// Pictogram walker / runner. Original drawing in the classic pedestrian-sign style:
// solid round head, thick round-capped limbs, jointed at hip/knee and shoulder/elbow.
// Animated with SMIL so it also works as a standalone .svg (and later in a widget).
function figureSVG(kind, opts = {}){
  const run = kind === 'run';
  const dur = run ? 0.62 : 1.05;                       // seconds per stride
  const sw = 6.4;                                      // limb thickness
  const H = [30, 36], N = [31.5, 18.5], S = [31.5, 21]; // hip, neck, shoulder
  const thigh = 12.5, shin = 13, upper = 9.5, fore = 8.5;
  const T = run ? '0;.25;.5;.7;.85;1' : '0;.25;.5;.75;1';
  const sp = ' keySplines="' + Array(T.split(';').length - 1).fill('.45 0 .55 1').join(';') + '" calcMode="spline"';
  const rot = (vals, cx, cy, begin = 0) =>
    `<animateTransform attributeName="transform" type="rotate" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" keyTimes="${T}"${sp} values="${vals.map(v => `${v} ${cx} ${cy}`).join(';')}"/>`;

  // [hip angle, knee angle] per key time; +ve = clockwise = limb end moves backward (figure faces right)
  const legHip  = run ? [-89, -29, 16, 6, -49, -89] : [-24, 2, 24, 0, -24];
  const legKnee = run ? [ 70, 15, 15, 75, 110, 70]  : [  2, 6, 14, 42, 2];
  const armSh   = run ? [ 36, 6, -69, -40, 10, 36]  : [ 26, 0, -26, 0, 26];
  const armEl   = run ? [-80, -85, -90, -88, -82, -80] : [-14, -22, -30, -22, -14];
  const bob     = run ? ['0 1.6', '0 -1.4', '0 1.6', '0 -1.6', '0 -0.4', '0 1.6'] : ['0 0.9', '0 -0.9', '0 0.9', '0 -0.9', '0 0.9'];
  const lean = run ? 14 : 4;

  const K = [H[0], H[1] + thigh];            // knee (unrotated)
  const E = [S[0], S[1] + upper];            // elbow (unrotated)
  const gap = opts.gap || 'var(--bg, #fff)';       // thin knockout so the near limbs read in front, like a road sign
  const seg = (x1, y1, x2, y2, near) => (near ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${gap}" stroke-width="${sw + 2.4}"/>` : '') + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const leg = (begin, near) => `<g>${rot(legHip, ...H, begin)}${seg(H[0], H[1], K[0], K[1], near)}
      <g>${rot(legKnee, ...K, begin)}${seg(K[0], K[1], K[0], K[1] + shin, near)}</g>${near ? `<line x1="${H[0]}" y1="${H[1]}" x2="${K[0]}" y2="${K[1]}"/>` : ''}</g>`;
  const arm = (begin, near) => `<g>${rot(armSh, ...S, begin)}${seg(S[0], S[1], E[0], E[1], near)}
      <g>${rot(armEl, ...E, begin)}${seg(E[0], E[1], E[0], E[1] + fore, near)}</g>${near ? `<line x1="${S[0]}" y1="${S[1]}" x2="${E[0]}" y2="${E[1]}"/>` : ''}</g>`;
  const half = -dur / 2;
  const label = opts.label || (run ? 'Running' : 'Walking');
  return `<svg class="fig fig-${kind}" viewBox="0 0 64 64" width="${opts.size || 64}" height="${opts.size || 64}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
   <g><animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" keyTimes="${T}"${sp} values="${bob.join(';')}"/>
    <g transform="rotate(${lean} ${H[0]} ${H[1]})">
     ${leg(half, false)}${arm(0, false)}
     <line x1="${N[0]}" y1="${N[1]}" x2="${H[0]}" y2="${H[1]}" stroke-width="${sw + 2.6}"/>
     <circle cx="${N[0] + 2.4}" cy="${N[1] - 8}" r="6.2" fill="currentColor" stroke="none"/>
     ${leg(0, true)}${arm(half, true)}
    </g>
   </g>
  </g>
</svg>`;
}
if (typeof module !== 'undefined') module.exports = { figureSVG };

// Celebrating pictogram: crouch, jump with both arms punching up, land. Same build as the walker/runner.
function cheerSVG(opts = {}){
  const dur = 0.95, sw = 6.4, size = opts.size || 64;
  const H = [32, 38], N = [32, 21];
  const thigh = 12, shin = 12.5, upper = 9, fore = 8.5;
  const K = [H[0], H[1] + thigh];
  const T = '0;.32;.55;.8;1';
  const sp = ' keySplines="' + Array(4).fill('.4 0 .6 1').join(';') + '" calcMode="spline"';
  const rot = (vals, cx, cy) => `<animateTransform attributeName="transform" type="rotate" dur="${dur}s" repeatCount="indefinite" keyTimes="${T}"${sp} values="${vals.map(v => `${v} ${cx} ${cy}`).join(';')}"/>`;
  const gap = opts.gap || 'var(--bg, #fff)';
  const seg = (x1, y1, x2, y2, near) => (near ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${gap}" stroke-width="${sw + 2.4}"/>` : '') + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  // crouch (knees bent, fists by the shoulders) -> jump (legs spread, arms straight up in a V) -> land
  const L = { hip: [-36, -22, -20, -36, -36], knee: [ 32, 6, 4, 32, 32] };
  const R = { hip: [ 36,  22,  20,  36,  36], knee: [-32, -6, -4, -32, -32] };
  const LA = { sh: [-112, -146, -142, -112, -112], el: [-62, -4, -8, -62, -62] };
  const RA = { sh: [ 112,  146,  142,  112,  112], el: [ 62,  4,  8,  62,  62] };
  const bob = ['0 3', '0 -11', '0 -8', '0 3', '0 3'];
  const leg = (P, near) => `<g>${rot(P.hip, ...H)}${seg(H[0], H[1], K[0], K[1], near)}<g>${rot(P.knee, ...K)}${seg(K[0], K[1], K[0], K[1] + shin, near)}</g></g>`;
  const arm = (P, Sx) => { const S = [Sx, 23.5], E = [Sx, 23.5 + upper];
    return `<g>${rot(P.sh, ...S)}<line x1="${S[0]}" y1="${S[1]}" x2="${E[0]}" y2="${E[1]}"/><g>${rot(P.el, ...E)}<line x1="${E[0]}" y1="${E[1]}" x2="${E[0]}" y2="${E[1] + fore}"/></g></g>`; };
  const shadow = `<ellipse cx="32" cy="65.5" rx="11" ry="1.6" fill="currentColor" opacity=".18"><animate attributeName="rx" dur="${dur}s" repeatCount="indefinite" keyTimes="${T}" values="11;6;7;11;11"/></ellipse>`;
  return `<svg class="fig fig-cheer" viewBox="0 -12 64 80" width="${size}" height="${Math.round(size * 80 / 64)}" role="img" aria-label="${opts.label || 'Celebrating'}" xmlns="http://www.w3.org/2000/svg">
  ${shadow}
  <g fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
   <g><animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" keyTimes="${T}"${sp} values="${bob.join(';')}"/>
     ${leg(R, false)}${leg(L, false)}
     ${arm(RA, 29.5)}${arm(LA, 34.5)}
     <line x1="${N[0]}" y1="${N[1]}" x2="${H[0]}" y2="${H[1]}" stroke-width="${sw + 3.4}"/>
     <circle cx="${N[0]}" cy="${N[1] - 8.6}" r="6.2" fill="currentColor" stroke="none"/>
   </g>
  </g>
</svg>`;
}
// Confetti burst (plays once per insertion). Mono pieces plus a few in the app's accent colours.
function confettiSVG(n = 26){
  const cols = ['currentColor', 'currentColor', 'var(--run, #E5483B)', 'var(--live, #22A447)', 'var(--muted, #777)'];
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + (Math.random() - .5) * .5, r = 70 + Math.random() * 55;
    const x = Math.cos(a) * r, y = Math.sin(a) * r * .75 - 20, fall = 40 + Math.random() * 40;
    const d = (1.3 + Math.random() * .6).toFixed(2), rotv = Math.round((Math.random() - .5) * 720);
    const w = 3 + Math.random() * 4, h = Math.random() < .5 ? w : 2.2;
    const c = cols[i % cols.length];
    out += `<g><animateTransform attributeName="transform" type="translate" dur="${d}s" fill="freeze" calcMode="spline" keyTimes="0;.45;1" keySplines=".1 .8 .3 1;.5 0 .9 .6" values="0 0;${x.toFixed(1)} ${y.toFixed(1)};${(x * 1.15).toFixed(1)} ${(y + fall).toFixed(1)}"/>
      <rect x="${(-w / 2).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${h < 3 ? 1 : w / 2}" fill="${c}">
        <animateTransform attributeName="transform" type="rotate" dur="${d}s" fill="freeze" values="0;${rotv}"/>
        <animate attributeName="opacity" dur="${d}s" fill="freeze" keyTimes="0;.7;1" values="1;1;0"/></rect></g>`;
  }
  return `<svg class="confetti" viewBox="-160 -140 320 280" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}
if (typeof module !== 'undefined') module.exports = Object.assign(module.exports || {}, { cheerSVG, confettiSVG });

// "Caught it": front-on bus pictogram (same solid style as the walk/run figures, knockouts in the
// background colour) with a green tick badge that pops on and draws its tick. Plays once and holds.
function busTickSVG(opts = {}){
  const size = opts.size || 64, gap = opts.gap || 'var(--bg, #fff)', ok = opts.ok || 'var(--live, #22A447)', still = !!opts.still;
  const A = (s) => still ? '' : s;
  const spl = 'calcMode="spline"';
  return `<svg class="fig fig-caught" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${opts.label || 'Caught the bus'}" xmlns="http://www.w3.org/2000/svg">
  <g>${A(`<animateTransform attributeName="transform" type="translate" dur=".5s" fill="freeze" ${spl} keyTimes="0;.65;1" keySplines=".3 0 .7 1;.3 0 .5 1" values="0 -9;0 1.6;0 0"/><animate attributeName="opacity" dur=".18s" fill="freeze" values="0;1"/>`)}
    <rect x="7.5" y="13" width="5" height="9" rx="2.5" fill="currentColor"/>
    <rect x="51.5" y="13" width="5" height="9" rx="2.5" fill="currentColor"/>
    <rect x="14" y="47" width="9" height="10" rx="3" fill="currentColor"/>
    <rect x="41" y="47" width="9" height="10" rx="3" fill="currentColor"/>
    <rect x="11" y="5" width="42" height="46" rx="9" fill="currentColor"/>
    <rect x="21" y="8.5" width="22" height="3" rx="1.5" fill="${gap}"/>
    <rect x="16" y="14.5" width="32" height="18" rx="3.5" fill="${gap}"/>
    <circle cx="19.5" cy="40.5" r="3.4" fill="${gap}"/>
    <circle cx="44.5" cy="40.5" r="3.4" fill="${gap}"/>
    <rect x="26.5" y="39" width="11" height="3" rx="1.5" fill="${gap}"/>
  </g>
  <g transform="translate(48 47)"><g ${still ? '' : 'transform="scale(0)"'}>${A(`<animateTransform attributeName="transform" type="scale" begin=".35s" dur=".42s" fill="freeze" ${spl} keyTimes="0;.6;1" keySplines=".2 .8 .4 1;.4 0 .6 1" values="0;1.18;1"/>`)}
    <g transform="translate(-48 -47)">
      <circle cx="48" cy="47" r="12.5" fill="${ok}" stroke="${gap}" stroke-width="4"/>
      <path d="M42 47.2l4.2 4.2 8-8.6" fill="none" stroke="${gap}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${still ? 0 : 1}">${A(`<animate attributeName="stroke-dashoffset" begin=".62s" dur=".32s" fill="freeze" ${spl} keyTimes="0;1" keySplines=".4 0 .2 1" values="1;0"/>`)}</path>
    </g>
  </g></g>
</svg>`;
}
if (typeof module !== 'undefined') module.exports = Object.assign(module.exports || {}, { busTickSVG });
