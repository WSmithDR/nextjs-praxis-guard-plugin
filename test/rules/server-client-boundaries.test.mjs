import rule from '../../rules/server-client-boundaries.mjs';
import assert from 'node:assert/strict';

const cfg = { enabled: true, serverOnly: ['server-only', 'next/headers', 'node:fs'] };
const full = { architecture: { strategy: 'by-feature' } };

const client = [
  "'use client';",
  "import { cookies } from 'next/headers';",
  "import fs from 'node:fs';",
  "export default function C(){ return null; }",
].join('\n');
const bad = rule(client, 'src/ui/C.tsx', cfg, full);
assert.equal(bad.length, 2, `got ${bad.length}`);
assert.equal(bad[0].rule, 'server-client-boundaries');

// server component (sin 'use client') -> 0
const server = "import { cookies } from 'next/headers';\nexport default function S(){ return null; }";
assert.equal(rule(server, 'src/ui/S.tsx', cfg, full).length, 0);

// client sin imports server-only -> 0
assert.equal(rule("'use client';\nimport { useState } from 'react';", 'src/ui/D.tsx', cfg, full).length, 0);

// sin strategy -> no corre
assert.equal(rule(client, 'src/ui/C.tsx', cfg, { architecture: {} }).length, 0);
console.log('server-client-boundaries.test ok');
