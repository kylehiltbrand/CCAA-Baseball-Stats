/* Cross-file global-scope collision check.
   data.js, proj2027.js and both inline blocks in projections.html share ONE
   global scope. A duplicate top-level `const` anywhere across them is a hard
   SyntaxError that silently kills every script after it — which is exactly how
   `f3` took out renderCard(), the tab count and the team tab's WAR scale at
   once. Checking for duplicates within a single file does not catch that.

   Only depth-0 declarations count, so brace depth is tracked and strings,
   template literals, regexes and comments are skipped. */
const fs = require('fs');

function topLevelDecls(src, label) {
  const out = [];
  let depth = 0, i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    // comments
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    // strings + template literals
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') line++;
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; continue; }
    if (depth === 0) {
      const rest = src.slice(i, i + 40);
      let m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(rest);
      if (m && (i === 0 || /[\s;}]/.test(src[i - 1]))) {
        out.push([m[1], label + ':' + line]); i += m[0].length; continue;
      }
      m = /^function\s+([A-Za-z_$][\w$]*)/.exec(rest);
      if (m && (i === 0 || /[\s;}]/.test(src[i - 1]))) {
        out.push([m[1], label + ':' + line]); i += m[0].length; continue;
      }
    }
    i++;
  }
  return out;
}

const page = fs.readFileSync('projections.html', 'utf8');
const inline = page.split(/<script(?![^>]*\bsrc=)[^>]*>/).slice(1)
  .map(b => b.split('</script>')[0]);

const sources = [
  ['data.js', fs.readFileSync('data.js', 'utf8')],
  ['proj2027.js', fs.readFileSync('proj2027.js', 'utf8')]
];
inline.forEach((b, k) => sources.push(['projections.html inline#' + (k + 1), b]));

const seen = new Map();
sources.forEach(([label, src]) =>
  topLevelDecls(src, label).forEach(([name, loc]) => {
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push(loc);
  }));

let bad = 0, total = 0;
seen.forEach((locs, name) => {
  total++;
  if (locs.length > 1) { bad++; console.log('  COLLISION  ' + name + '  ->  ' + locs.join(', ')); }
});
console.log(bad
  ? '\n  ' + bad + ' global-scope collision(s) — the page will throw'
  : '  no global-scope collisions across ' + sources.length +
    ' scripts (' + total + ' top-level identifiers)');
process.exit(bad ? 1 : 0);
