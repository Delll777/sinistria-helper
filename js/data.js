const NAMES = ['fetches', 'skills', 'talents', 'talent_tree'];

export async function loadAll() {
  const out = {};
  for (const n of NAMES) {
    const res = await fetch(`data/${n}.json`);
    if (!res.ok) throw new Error(`не загрузился ${n}.json`);
    out[n] = await res.json();
  }
  return out;
}
