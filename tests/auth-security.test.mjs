import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

async function withApp(run) {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body, cookie) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  try { await run({ base, post }); }
  finally { await new Promise(resolve => server.close(resolve)); db.close(); }
}

test('known and unknown emails both perform exactly one password derivation on login', async t => {
  await withApp(async ({ post }) => {
    let calls = 0;
    const original = crypto.scryptSync;
    const replacement = t.mock.method(crypto, 'scryptSync', (...args) => {
      calls++;
      return original(...args);
    });
    syncBuiltinESMExports();
    try {
      for (const email of ['client@qinghe.demo', 'unknown@example.test']) {
        calls = 0;
        const response = await post('/auth/login', { email, password: 'wrong-password' });
        assert.equal(response.status, 401);
        assert.equal((await response.json()).error, '邮箱或密码不正确。');
        assert.equal(calls, 1, `${email} must not reveal existence through extra password work`);
      }
    } finally { replacement.mock.restore(); syncBuiltinESMExports(); }
  });
});

test('registering from a signed-in browser retires the previous session only after success', async () => {
  await withApp(async ({ base, post }) => {
    const login = await post('/auth/login', { email: 'client@qinghe.demo', password: 'MarketDemo2026!' });
    const previous = login.headers.get('set-cookie').split(';')[0];
    const me = async cookie => (await (await fetch(`${base}/auth/me`, { headers: { Cookie: cookie } })).json()).user;
    const input = { name: 'New customer', email: 'signup@example.test', password: 'StrongPassword2026!' };
    const rejected = await post('/auth/register', { ...input, password: 'short' }, previous);
    assert.equal(rejected.status, 400);
    assert.equal((await me(previous)).email, 'client@qinghe.demo');
    const registered = await post('/auth/register', input, previous);
    assert.equal(registered.status, 201);
    const next = registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await me(next)).email, input.email);
    assert.equal(await me(previous), null);
  });
});
