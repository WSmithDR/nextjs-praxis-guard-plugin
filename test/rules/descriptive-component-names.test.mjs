import rule from '../../rules/descriptive-component-names.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true };

// nombre genérico pelado -> warn
const card = 'export function Card() { return <div>x</div>; }';
const r = rule(card, 'Card.tsx', cfg);
assert.equal(r.length, 1);
assert.equal(r[0].severity, 'warn');
assert.ok(/Card/.test(r[0].message));

// nombre con prefijo de dominio -> 0
assert.equal(rule('export function SectionCard() { return <div/>; }', 'SectionCard.tsx', cfg).length, 0, 'prefijo de dominio ok');

// arrow component genérico -> warn
assert.equal(rule('export const Item = (p) => <li/>;', 'Item.tsx', cfg).length, 1, 'arrow genérico');

// allow exime un nombre
assert.equal(rule(card, 'Card.tsx', { enabled: true, allow: ['Card'] }).length, 0, 'allow exime');

// blocklist custom: Panel marcado, Card no
const custom = { enabled: true, blocklist: ['Panel'] };
assert.equal(rule('export function Panel(){return <div/>;}', 'Panel.tsx', custom).length, 1, 'blocklist custom marca Panel');
assert.equal(rule(card, 'Card.tsx', custom).length, 0, 'Card fuera de blocklist custom');

// no .tsx/.jsx -> 0 ; sin JSX -> 0 ; disabled -> 0
assert.equal(rule(card, 'Card.ts', cfg).length, 0);
assert.equal(rule('export function Card(){ return 1; }', 'Card.tsx', cfg).length, 0, 'sin JSX no es componente');
assert.equal(rule(card, 'Card.tsx', { enabled: false }).length, 0);
console.log('descriptive-component-names.test ok');
