import { extractClassNames } from '../../lib/classname.mjs';
import assert from 'node:assert/strict';

const src = [
  '<div className="p-4 flex">',
  "<span className={'text-sm ' + x}>",
  '<b className={clsx("a", "b")}>',
].join('\n');
const out = extractClassNames(src);
assert.ok(out.some((c) => c.value.includes('p-4') && c.line === 1));
assert.ok(out.some((c) => c.value.includes('text-sm') && c.line === 2));
console.log('classname.test ok');
