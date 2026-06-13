// lib/scope.mjs
export function isInScope(filePath, config) {
  if (!filePath || typeof filePath !== 'string') return false;
  const norm = filePath.replace(/\\/g, '/');
  const segs = norm.split('/');
  const exclude = (config.exclude || []).map((d) => d.replace(/\/$/, ''));
  if (exclude.some((d) => segs.includes(d))) return false;
  const include = config.include || [];
  return include.some((ext) => norm.endsWith(ext));
}
