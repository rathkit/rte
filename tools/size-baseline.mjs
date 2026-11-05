// The size ratchet. The budget in each package.json is a ceiling with room under it; this holds each entry to the size recorded in
// size-baseline.json plus a margin, so growth that still fits under the ceiling is seen, and an increase is a recorded decision.
//   baselineProblems(baseline, measured) -> sentences, empty when every entry is within its recorded size plus the margin
//   recorded(baseline, measured, reason, date) -> the baseline with every size set to what was measured, and each change in its history
// `measured` maps an entry ("@rathkit/rte-core core") to bytes. The margin is the larger of a share and a number of bytes, so a tiny
// entry is not held to a few bytes and a large one is not allowed a kilobyte.
const allowance = (baseline, bytes) => Math.max(Math.ceil((bytes * baseline.margin.percent) / 100), baseline.margin.bytes);

export function baselineProblems(baseline, measured) {
  const out = [];
  for (const [name, bytes] of Object.entries(measured)) {
    const was = baseline.sizes[name];
    if (was === undefined) { out.push(`${name} has no recorded size: run  pnpm check:size --record "new entry"`); continue; }
    const room = allowance(baseline, was);
    if (bytes > was + room) {
      out.push(`${name} grew from ${was} to ${bytes} bytes (+${bytes - was}), over the margin of ${room} bytes. If the growth is approved: pnpm check:size --record "why"`);
    }
  }
  for (const name of Object.keys(baseline.sizes)) if (!(name in measured)) out.push(`${name} is recorded but no longer measured: run  pnpm check:size --record "entry removed"`);
  return out;
}

export function recorded(baseline, measured, reason, date) {
  const sizes = { ...Object.fromEntries(Object.entries(baseline.sizes).filter(([name]) => name in measured)) };
  const history = [...baseline.history];
  for (const [name, bytes] of Object.entries(measured)) {
    const from = baseline.sizes[name];
    if (from !== bytes) history.push({ date, entry: name, from: from ?? null, to: bytes, reason });
    sizes[name] = bytes;
  }
  for (const name of Object.keys(baseline.sizes)) if (!(name in measured)) history.push({ date, entry: name, from: baseline.sizes[name], to: null, reason });
  return { ...baseline, sizes: Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))), history };
}
