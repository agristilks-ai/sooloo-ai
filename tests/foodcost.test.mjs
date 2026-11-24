// Tests the pure functions of the Plate Cost Calculator (public/food-cost/index.html) and the lead endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const html = readFileSync(new URL('../public/food-cost/index.html', import.meta.url), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const {num, ingredientCost, dishCost, pricing, niceUp, money} = new Function(core + '; return {num, ingredientCost, dishCost, pricing, niceUp, money};')();
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);

test('reads European and English number formats', () => {
  assert.equal(num('12,90'), 12.9); assert.equal(num('1.234,50'), 1234.5); assert.equal(num('1,234.50'), 1234.5); assert.equal(num(' 180 '), 180);
  assert.ok(Number.isNaN(num(''))); assert.ok(Number.isNaN(num('abc')));
});

test('ingredient cost converts units and applies trim yield', () => {
  near(ingredientCost({amount: '180', unit: 'g', price: '12.90', per: 'kg'}).cost, 2.322);
  near(ingredientCost({amount: '150', unit: 'g', price: '20', per: 'kg', yieldPct: '75'}).cost, 4);
  near(ingredientCost({amount: '50', unit: 'ml', price: '2,40', per: 'l'}).cost, 0.12);
  near(ingredientCost({amount: '1', unit: 'pcs', price: '0.85', per: 'pcs'}).cost, 0.85);
  near(ingredientCost({amount: '0.2', unit: 'kg', price: '10', per: 'kg'}).cost, 2);
});

test('flags mismatched units, missing values and bad yield', () => {
  assert.equal(ingredientCost({amount: '100', unit: 'g', price: '3', per: 'l'}).error, 'mismatch');
  assert.equal(ingredientCost({amount: '', unit: 'g', price: '3', per: 'kg'}).error, 'missing');
  assert.equal(ingredientCost({amount: '10', unit: 'g', price: '3', per: 'kg', yieldPct: '0'}).error, 'yield');
  assert.equal(ingredientCost({amount: '10', unit: 'g', price: '3', per: 'kg', yieldPct: '120'}).error, 'yield');
});

test('dish cost per portion and shares', () => {
  const r = dishCost({portions: '4', items: [
    {name: 'Mince', amount: '600', unit: 'g', price: '12', per: 'kg'},
    {name: 'Buns', amount: '4', unit: 'pcs', price: '0.5', per: 'pcs'},
    {name: 'Bad', amount: '', unit: 'g', price: '', per: 'kg'}]});
  near(r.total, 9.2); near(r.perPortion, 2.3); assert.equal(r.complete, false);
  near(r.lines[0].share, 7.2 / 9.2);
  near(dishCost({portions: '0', items: [{amount: '1', unit: 'pcs', price: '2', per: 'pcs'}]}).perPortion, 2);
});

test('pricing: suggested price with tax, food cost % on net price', () => {
  const p = pricing(3, {targetPct: '30', vatPct: '25', menuPrice: '18.75'});
  near(p.suggestedGross, 12.5);
  near(p.actualPct, 20); near(p.profitNet, 12);
  const q = pricing(3.1, {targetPct: '30', vatPct: '0', menuPrice: ''});
  near(q.suggestedGross, 10.4); assert.ok(Number.isNaN(q.actualPct));
  assert.ok(Number.isNaN(pricing(0, {targetPct: '30'}).suggestedGross));
});

test('rounding and money formatting', () => {
  near(niceUp(10.31), 10.4); near(niceUp(23.2), 23.5); near(niceUp(141.2), 142);
  assert.equal(money(2.3, '€'), '€2.30'); assert.equal(money(2.3, 'kr'), '2,30 kr'); assert.equal(money(NaN, '€'), '–');
});

function d1() {
  const db = new DatabaseSync(':memory:');
  return {db, prepare: sql => { const st = db.prepare(sql); const wrap = args => ({run: async () => st.run(...args)}); return {bind: (...a) => wrap(a), ...wrap([])}; }};
}
const {onRequestPost} = await import(new URL('../functions/api/lead.js', import.meta.url));
const req = (body, origin = 'https://tilksweb.com') => new Request('https://tilksweb.com/api/lead', {method: 'POST', headers: {'content-type': 'application/json', origin}, body: typeof body === 'string' ? body : JSON.stringify(body)});

test('lead endpoint stores email once per tool, with consent only', async () => {
  const DB = d1(), env = {DB};
  let r = await onRequestPost({request: req({email: ' Chef@Example.com ', consent: true, source: 'food-cost'}), env});
  assert.equal(r.status, 200);
  r = await onRequestPost({request: req({email: 'chef@example.com', consent: true, source: 'food-cost'}), env});
  assert.equal(r.status, 200);
  const rows = DB.db.prepare('SELECT email, source FROM leads').all();
  assert.deepEqual(rows.map(x => [x.email, x.source]), [['chef@example.com', 'food-cost']]);
  assert.equal((await onRequestPost({request: req({email: 'a@b.co', consent: false, source: 'food-cost'}), env})).status, 400);
  assert.equal((await onRequestPost({request: req({email: 'not-an-email', consent: true, source: 'food-cost'}), env})).status, 400);
  assert.equal((await onRequestPost({request: req({email: 'a@b.co', consent: true, source: 'other'}), env})).status, 400);
  assert.equal((await onRequestPost({request: req({email: 'a@b.co', consent: true, source: 'food-cost'}, 'https://evil.example'), env})).status, 403);
  assert.equal((await onRequestPost({request: req('{bad'), env})).status, 400);
  assert.equal((await onRequestPost({request: req({email: 'a@b.co', consent: true, source: 'food-cost'}), env: {}})).status, 503);
});
