import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSimilarGroups } from '../../lib/similar-components.mjs';

const dir = mkdtempSync(join(tmpdir(), 'simc-'));
const a = join(dir, 'CardA.tsx');
writeFileSync(a, 'export function Card(props){ return <div><h2>{props.title}</h2><p>{props.body}</p><button>a</button></div>; }');
const b = join(dir, 'CardB.tsx');
writeFileSync(b, 'export function CardB(props){ return <div><h2>{props.t}</h2><p>{props.b}</p><button>x</button></div>; }');
const o = join(dir, 'Other.tsx');
writeFileSync(o, 'export function Other(){ return <span>hi</span>; }');

const groups = findSimilarGroups(ts, [a, b, o], { threshold: 0.8, minElements: 2 });
assert.equal(groups.length, 1, `groups=${groups.length}`);
assert.equal(groups[0].components.length, 2);
assert.deepEqual(groups[0].components.map((c) => c.name).sort(), ['Card', 'CardB']);
assert.ok(groups[0].similarity >= 0.8, `sim=${groups[0].similarity}`);
assert.ok(!groups.some((g) => g.components.some((c) => c.name === 'Other')), 'Other no agrupa (size < min)');

const d = join(dir, 'Dup.tsx');
writeFileSync(d, 'export function Dup(props){ return <div><h2>{props.title}</h2><p>{props.body}</p><button>a</button></div>; }');
const g2 = findSimilarGroups(ts, [a, d], { threshold: 0.9, minElements: 2 });
assert.equal(g2.length, 1);
assert.equal(g2[0].similarity, 1);

const e = join(dir, 'Two.tsx');
writeFileSync(e, 'export function P(){ return <div><h2/><p/><button/></div>; }\nexport function Q(){ return <div><h2/><p/><button/></div>; }');
assert.equal(findSimilarGroups(ts, [e], { threshold: 0.8, minElements: 2 }).length, 0, 'mismo archivo no cuenta');

console.log('similar-components.test ok');
