import rule from '../../rules/single-component-per-file.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };

// dos componentes en un archivo -> 1 finding (warn) que los nombra
const two = `
export function Card() { return <div>hi</div>; }
function Badge() { return <span>x</span>; }
`;
const r = rule(two, 'Card.tsx', cfg);
assert.equal(r.length, 1, `esperaba 1, got ${r.length}`);
assert.equal(r[0].severity, 'warn');
assert.ok(/Card/.test(r[0].message) && /Badge/.test(r[0].message), 'nombra ambos');

// un solo componente -> 0
assert.equal(rule('export default function Page(){ return <main/>; }', 'page.tsx', cfg).length, 0);

// arrows (con tipo de retorno y con bloque) -> cuenta
const arrows = `
export const Foo = (props: P): JSX.Element => <div/>;
const Bar = () => { return <span/>; };
`;
assert.equal(rule(arrows, 'x.tsx', cfg).length, 1, 'cuenta arrow components');

// subcomponente anidado (indentado) NO cuenta como top-level
const nested = `
export function List() {
  const Item = () => <li/>;
  return <ul><Item/></ul>;
}
`;
assert.equal(rule(nested, 'List.tsx', cfg).length, 0, 'anidado no cuenta');

// archivo no .tsx/.jsx -> 0
assert.equal(rule(two, 'Card.ts', cfg).length, 0, 'solo tsx/jsx');
// dos funciones PascalCase sin JSX -> 0 (no son componentes)
assert.equal(rule('function Foo(){return 1}\nfunction Bar(){return 2}', 'a.tsx', cfg).length, 0, 'sin JSX no marca');
// disabled
assert.equal(rule(two, 'Card.tsx', { enabled: false }).length, 0);
console.log('single-component-per-file.test ok');
