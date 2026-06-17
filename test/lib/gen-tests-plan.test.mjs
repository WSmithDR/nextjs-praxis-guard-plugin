import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestPlan } from '../../lib/gen-tests-plan.mjs';

// Proyecto A: vitest + RTL, componente con props
const a = mkdtempSync(join(tmpdir(), 'gt-a-'));
writeFileSync(join(a, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1', '@testing-library/react': '^14' } }));
mkdirSync(join(a, 'src'), { recursive: true });
const btn = join(a, 'src', 'Button.tsx');
writeFileSync(btn, `export default function Button(props: { label: string; onClick: () => void }) {
  return <button onClick={props.onClick}>{props.label}</button>;
}`);
const pa = buildTestPlan(ts, a, btn);
assert.equal(pa.framework, 'vitest');
assert.equal(pa.usesRTL, true);
assert.equal(pa.testFilePath, 'src/Button.test.tsx');
assert.equal(pa.exists, false);
assert.equal(pa.component.name, 'Button');
assert.equal(pa.component.exportKind, 'default');
assert.equal(pa.component.isReactComponent, true);
const props = pa.component.props.map((p) => p.name);
assert.ok(props.includes('label') && props.includes('onClick'), `props=${props}`);

// Proyecto B: jest, util function
const b = mkdtempSync(join(tmpdir(), 'gt-b-'));
writeFileSync(join(b, 'package.json'), JSON.stringify({ devDependencies: { jest: '^29' } }));
writeFileSync(join(b, 'x.ts'), 'export function add(a: number, b: number) { return a + b; }');
const pb = buildTestPlan(ts, b, join(b, 'x.ts'));
assert.equal(pb.framework, 'jest');
assert.equal(pb.component.isReactComponent, false);
assert.ok(pb.component.props.map((p) => p.name).includes('a'));

// Proyecto C: sin framework -> node:test; test ya existe
const c = mkdtempSync(join(tmpdir(), 'gt-c-'));
writeFileSync(join(c, 'package.json'), JSON.stringify({}));
writeFileSync(join(c, 'y.ts'), 'export function f() {}');
writeFileSync(join(c, 'y.test.ts'), '// ya existe');
const pc = buildTestPlan(ts, c, join(c, 'y.ts'));
assert.equal(pc.framework, 'node:test');
assert.equal(pc.exists, true);

// export default Foo (identificador a una función definida arriba) -> resuelve props/React
const d = mkdtempSync(join(tmpdir(), 'gt-d-'));
writeFileSync(join(d, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1' } }));
const card = join(d, 'Card.tsx');
writeFileSync(card, `function Card(props: { title: string }) { return <div>{props.title}</div>; }\nexport default Card;`);
const pd = buildTestPlan(ts, d, card);
assert.equal(pd.component.name, 'Card');
assert.equal(pd.component.exportKind, 'default');
assert.equal(pd.component.isReactComponent, true, 'export default Foo resuelto');
assert.ok(pd.component.props.map((p) => p.name).includes('title'), 'props del Foo resuelto');

// named export component
const e = mkdtempSync(join(tmpdir(), 'gt-e-'));
writeFileSync(join(e, 'package.json'), JSON.stringify({}));
const named = join(e, 'Nav.tsx');
writeFileSync(named, 'export function Nav(props: { items: string[] }) { return null; }');
const pe = buildTestPlan(ts, e, named);
assert.equal(pe.component.name, 'Nav');
assert.equal(pe.component.exportKind, 'named');

// sin export parseable -> component null
const f = mkdtempSync(join(tmpdir(), 'gt-f-'));
writeFileSync(join(f, 'package.json'), JSON.stringify({}));
const noexp = join(f, 'z.ts');
writeFileSync(noexp, 'const x = 5; console.log(x);');
assert.equal(buildTestPlan(ts, f, noexp).component, null);

console.log('gen-tests-plan.test ok');
