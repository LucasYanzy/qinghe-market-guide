import assert from 'node:assert/strict';
import test from 'node:test';
import { canRestoreShoppingDraft, parseShoppingDraft } from '../src/shoppingDraft.ts';

const today = '2026-10-30';
const snapshot = { version: 1, savedOn: today, date: '2026-10-31', owner: null, cart: { 1: 2 }, checkout: { slot: '11:00–12:00', note: 'Pickup note', paymentMethod: 'snap_ebt' } };
const parse = (value) => parseShoppingDraft(JSON.stringify(value), today);

test('shopping drafts retain future pickup choices and reject stale dates or malformed quantities', () => {
  assert.deepEqual(parse(snapshot), snapshot);
  assert.equal(parse({...snapshot,cart:{1:0.875}}).cart[1],0.875);
  for (const changes of [
    { version: 2 }, { savedOn: '2026-10-29' }, { date: '2026-10-29' }, { date: '2026-11-31' },
    { owner: -1 }, { cart: { 1: -1 } }, { cart: { 1: 0.0001 } }, { cart: { 1: 101 } }, { cart: { 1: '2' } },
    { cart: { 'not-an-id': 2 } }, { cart: [] }, { checkout: null },
  ]) {
    assert.equal(parse({ ...snapshot, ...changes }), undefined);
  }
  assert.equal(parseShoppingDraft('{"version":1,"savedOn":"2026-10-30","date":"2026-10-31","owner":null,"cart":{"__proto__":2},"checkout":{"slot":"","note":""}}', today), undefined);
  assert.equal(parseShoppingDraft('invalid', today), undefined);
});

test('draft ownership isolates accounts and management roles; notes and payment values are bounded', () => {
  const guest = parse(snapshot);
  const own = parse({ ...snapshot, owner: 3 });
  const client = { id: 3, role: 'client' };
  assert.equal(canRestoreShoppingDraft(guest, null), true);
  assert.equal(canRestoreShoppingDraft(guest, client), true);
  assert.equal(canRestoreShoppingDraft(own, client), true);
  assert.equal(canRestoreShoppingDraft(own, null), false);
  assert.equal(canRestoreShoppingDraft(own, { id: 4, role: 'client' }), false);
  assert.equal(canRestoreShoppingDraft(guest, { id: 3, role: 'retailer' }), false);
  assert.equal(canRestoreShoppingDraft(guest, { id: 3, role: 'admin' }), false);
  const bounded = parse({ ...snapshot, checkout: { slot: 's'.repeat(200), note: 'n'.repeat(500), paymentMethod: 'unexpected' } });
  assert.equal(bounded.checkout.slot.length, 100);
  assert.equal(bounded.checkout.note.length, 300);
  assert.equal(bounded.checkout.paymentMethod, 'pay_at_pickup');
});
