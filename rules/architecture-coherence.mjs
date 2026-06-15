// rules/architecture-coherence.mjs
// Project rule: coherencia global con architecture.strategy.
const TYPE_DIRS = ['components', 'hooks', 'services', 'models', 'containers', 'utils'];

export default function architectureCoherence(tree, full = {}) {
  const arch = full.architecture || {};
  const cfg = (full.rules && full.rules['architecture-coherence']) || {};
  if (cfg.enabled === false) return [];
  if (arch.strategy == null) return [];

  const root = (arch.root || 'src').replace(/\\/g, '/');
  const featuresDir = (arch.featuresDir || 'src/features').replace(/\\/g, '/');
  const shared = (arch.sharedDirs || []).map((d) => String(d).replace(/\\/g, '/'));
  const dirs = tree.dirs instanceof Set ? tree.dirs : new Set(tree.dirs || []);
  const out = [];

  if (arch.strategy === 'by-feature') {
    // dirs de tipo colgando directo del root (no bajo features ni shared) -> drift
    for (const t of TYPE_DIRS) {
      const candidate = `${root}/${t}`;
      if (!dirs.has(candidate)) continue;
      const underShared = shared.some((s) => candidate === s || candidate.startsWith(s + '/'));
      if (underShared) continue;
      out.push({ rule: 'architecture-coherence', severity: 'warn', file: candidate,
        message: `Estrategia by-feature pero existe "${candidate}" global. Movélo dentro de una feature o a sharedDirs.` });
    }
  } else if (arch.strategy === 'by-layer') {
    if (dirs.has(featuresDir)) {
      out.push({ rule: 'architecture-coherence', severity: 'warn', file: featuresDir,
        message: `Estrategia by-layer pero existe "${featuresDir}". Mezcla de estrategias: elegí una.` });
    }
  }
  return out;
}
