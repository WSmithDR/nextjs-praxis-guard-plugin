// lib/scope.mjs
export function isInScope(filePath, config) {
  if (!filePath || typeof filePath !== 'string') return false;
  const norm = filePath.replace(/\\/g, '/');
  const exclude = config.exclude || [];
  if (exclude.some((dir) => norm.includes(dir))) return false;
  const include = config.include || [];
  return include.some((ext) => norm.endsWith(ext));
}
