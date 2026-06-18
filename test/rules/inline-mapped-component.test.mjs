import rule from '../../rules/inline-mapped-component.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, minTags: 3 };

// bloque JSX grande mapeado (3 tags) -> 1 finding info
const big = `
export default function List({items}) {
  return <ul>{items.map((it) => (
    <li className="row">
      <h3>{it.title}</h3>
      <p>{it.body}</p>
    </li>
  ))}</ul>;
}
`;
const r = rule(big, 'List.tsx', cfg);
assert.equal(r.length, 1, `esperaba 1, got ${r.length}`);
assert.equal(r[0].severity, 'info');
assert.ok(/extra/i.test(r[0].message), 'sugiere extraer');

// map de un solo elemento -> 0 (ya es trivial)
const small = 'const X = () => <ul>{items.map((it) => <li key={it.id}>{it.name}</li>)}</ul>;';
assert.equal(rule(small, 'x.tsx', cfg).length, 0, 'un solo tag no se marca');

// map sin JSX -> 0
assert.equal(rule('const y = arr.map((n) => n * 2);', 'a.tsx', cfg).length, 0);

// minTags configurable
assert.equal(rule(small, 'x.tsx', { enabled: true, minTags: 1 }).length, 1, 'minTags=1 marca el chico');

// no .tsx -> 0 ; disabled -> 0
assert.equal(rule(big, 'List.ts', cfg).length, 0);
assert.equal(rule(big, 'List.tsx', { enabled: false }).length, 0);
console.log('inline-mapped-component.test ok');
