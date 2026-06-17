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

// robustez: archivos que no parsean / no existen se saltean sin lanzar (nunca throws)
const broken = join(dir, 'Broken.tsx');
writeFileSync(broken, 'export function B(props){ return <div><h2>{props.t}</h2><p>{props.b}</p><button</button</div>; '); // JSX roto + sin cerrar
const missing = join(dir, 'NoExiste.tsx');
assert.doesNotThrow(() => {
  const g = findSimilarGroups(ts, [a, broken, missing], { threshold: 0.8, minElements: 2 });
  assert.ok(Array.isArray(g), 'devuelve un array aun con basura');
}, 'findSimilarGroups nunca lanza con archivos rotos/inexistentes');
// con todo basura -> reporte vacío
assert.deepEqual(findSimilarGroups(ts, [broken, missing], { threshold: 0.8, minElements: 2 }), [], 'solo basura -> sin grupos');

// agrupado transitivo: el piso (min pairwise) puede quedar por debajo del threshold pedido.
// A~B y B~C ≥ 0.7, pero A~C ≈ 0.54 < 0.7 → union-find igual los junta a los tres.
const t1 = join(dir, 'T1.tsx');
writeFileSync(t1, 'export function T1(){ return <div><h2/><p/><section/><article/></div>; }');         // div,h2,p,section,article
const t2 = join(dir, 'T2.tsx');
writeFileSync(t2, 'export function T2(){ return <div><h2/><p/><section/><aside/></div>; }');           // difiere de T1 en 1 (article→aside)
const t3 = join(dir, 'T3.tsx');
writeFileSync(t3, 'export function T3(){ return <div><h2/><p/><nav/><aside/></div>; }');               // difiere de T2 en 1, de T1 en 2
const tg = findSimilarGroups(ts, [t1, t2, t3], { threshold: 0.7, minElements: 3 });
assert.equal(tg.length, 1, 'cadena transitiva -> un grupo');
assert.equal(tg[0].components.length, 3, 'los tres unidos por transitividad');
assert.ok(tg[0].similarity < 0.7, `piso conservador cae por debajo del threshold (sim=${tg[0].similarity})`);

console.log('similar-components.test ok');
