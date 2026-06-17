import assert from 'node:assert/strict';
import ts from 'typescript';
import { extractComponents, fingerprintComponent, similarity } from '../../lib/component-fingerprint.mjs';

function parse(code) { return ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true); }

const sf = parse(`
export function Card(props) {
  const [open, setOpen] = useState(false);
  return <div><h2>{props.t}</h2><button onClick={() => setOpen(true)}>x</button></div>;
}
function notAComponent() { return 5; }
`);
const comps = extractComponents(ts, sf);
assert.equal(comps.length, 1, `comps=${comps.length}`);
assert.equal(comps[0].name, 'Card');

const fp = fingerprintComponent(ts, comps[0].fnNode);
assert.equal(fp.elements.get('div'), 1);
assert.equal(fp.elements.get('button'), 1);
assert.equal(fp.size, 3);
assert.ok(fp.hooks.has('useState'));

assert.equal(similarity(fp, fp), 1);
const fp2 = fingerprintComponent(ts, extractComponents(ts, parse('export function S(){ return <span>x</span>; }'))[0].fnNode);
assert.ok(similarity(fp, fp2) < 1);

console.log('component-fingerprint.test ok');
