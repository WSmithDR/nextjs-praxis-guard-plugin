// lib/glob.mjs
// Glob mínimo para paths: ** cruza directorios, * no cruza '/'.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {       // **  -> cualquier cosa (incl. '/')
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;  // consumir el '/' que sigue a **
      } else {
        re += '[^/]*';                 // *   -> dentro de un segmento
      }
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchGlob(path, glob) {
  return globToRegExp(glob).test(String(path).replace(/\\/g, '/'));
}
