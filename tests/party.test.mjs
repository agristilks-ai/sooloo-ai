// Tests the pure functions of the free Party Pre-Order Calculator (public/party/index.html).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html = readFileSync(new URL('../public/party/index.html', import.meta.url), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const {parsePreorders, calculate, roundUp, fmtKg} = new Function(core + '; return {parsePreorders, calculate, roundUp, fmtKg};')();

const demo = ['Guest\tStarter\tMain\tDessert'];
for (let i = 0; i < 80; i++) demo.push(['Guest ' + (i + 1), i < 34 ? 'Soup' : 'Tartare', i < 52 ? 'Beef' : 'Salmon', i < 41 ? 'Brownie' : 'Cheese'].join('\t'));

test('counts dishes per course from a tab-separated paste with header', () => {
  const r = parsePreorders(demo.join('\n'));
  assert.equal(r.guests, 80);
  assert.deepEqual(r.courses.map(c => c.name), ['Starter', 'Main', 'Dessert']);
  assert.deepEqual(r.courses[1].dishes.map(d => [d.name, d.count]), [['Beef', 52], ['Salmon', 28]]);
});

test('comma-separated, no header, names detected, blanks skipped, case merged', () => {
  const r = parsePreorders('Anna,Soup,Beef\nMark,soup,Salmon\nLena,Tartare,\nTom,Soup,beef\nIvo,-,Beef');
  assert.equal(r.courses.length, 2);
  assert.deepEqual(r.courses[0].dishes.map(d => [d.name, d.count]), [['Soup', 3], ['Tartare', 1]]);
  assert.deepEqual(r.courses[1].dishes.map(d => [d.name, d.count]), [['Beef', 3], ['Salmon', 1]]);
});

test('single-column list counts one course', () => {
  const r = parsePreorders('Beef\nBeef\nSalmon');
  assert.deepEqual(r.courses[0].dishes.map(d => [d.name, d.count]), [['Beef', 2], ['Salmon', 1]]);
});

test('prep list and supplier order maths (matches the video example)', () => {
  const courses = [{name: 'Main', dishes: [{name: 'Beef', count: 52, items: [{name: 'Beef fillet', grams: 180}]}, {name: 'Salmon', count: 28, items: [{name: 'Salmon fillet', grams: 160}]}]}];
  const {prep, order} = calculate(courses, 10, 1);
  assert.equal(fmtKg(prep[0].kg), '10.3');
  assert.equal(fmtKg(prep[1].kg), '4.93');
  assert.deepEqual(order.map(o => [o.ingredient, o.order]), [['Beef fillet', 11], ['Salmon fillet', 5]]);
});

test('same ingredient in two dishes is added together in the order', () => {
  const courses = [{name: 'A', dishes: [{name: 'X', count: 10, items: [{name: 'Butter', grams: 20}]}, {name: 'Y', count: 10, items: [{name: 'butter ', grams: 30}]}]}];
  const {order} = calculate(courses, 0, 0.1);
  assert.equal(order.length, 1); assert.equal(order[0].order.toFixed(1), '0.5');
});

test('rounding and empty input', () => {
  assert.equal(roundUp(10.0, 1), 10); assert.equal(roundUp(10.01, 1), 11); assert.equal(roundUp(4.93, 0.5), 5);
  assert.deepEqual(parsePreorders('   '), {courses: [], guests: 0});
  assert.deepEqual(calculate([], 10, 1), {prep: [], order: []});
});
