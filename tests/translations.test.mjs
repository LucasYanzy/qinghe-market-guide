import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { english } from '../src/translations/en.ts';
import { matchesSearch, quantityUnit, translate } from '../src/translations/translate.ts';

const han = /\p{Script=Han}/u;

test('every shipped Chinese UI, demo-product, reference, and API message has an English translation', () => {
  const missing = [];
  const files = readdirSync('src').filter((file) => /\.(tsx?|mjs)$/.test(file)).map((file) => `src/${file}`)
    .concat(readdirSync('server').filter((file) => file.endsWith('.mjs') && file !== 'index.mjs').map((file) => `server/${file}`));
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && han.test(node.text)) {
        // A demo customer's name is personal content, not a UI translation key.
        if (!(file === 'server/db.mjs' && node.text === '林同学') && !Object.hasOwn(english, node.text)) {
          missing.push(`${file}: ${node.text}`);
        }
      }
      if (ts.isJsxText(node) && han.test(node.text) && !(file === 'src/i18n.tsx' && node.text.trim() === '中文')) {
        missing.push(`${file}: untranslated JSX text: ${node.text.trim()}`);
      }
      if (ts.isTemplateExpression(node) && [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].some((text) => han.test(text))) {
        missing.push(`${file}: use a parameterized translation instead of a Chinese template literal`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const visitReference = (value) => {
    if (typeof value === 'string' && han.test(value) && !Object.hasOwn(english, value)) missing.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visitReference);
  };
  for (const file of readdirSync('references').filter((file) => file.endsWith('.json'))) {
    visitReference(JSON.parse(readFileSync(`references/${file}`, 'utf8')));
  }
  assert.deepEqual(missing, []);
});

test('translations preserve all sentence parameters and contain no Chinese fallback text', () => {
  for (const [key, value] of Object.entries(english)) {
    assert.ok(value.trim(), `Empty translation: ${key}`);
    assert.equal(han.test(value), false, `Chinese in English translation: ${key}`);
    const placeholders = (s) => [...s.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
    assert.deepEqual(placeholders(value), placeholders(key), `Changed parameters: ${key}`);
  }
});

test('dynamic messages translate products and units while preserving customer names and unknown content', () => {
  const message = {
    message: '{product} 库存不足，当前剩余 {stock} {unit}。',
    values: { product: { message: '藤熟番茄' }, stock: 3, unit: { message: '磅' } },
  };
  assert.equal(translate('en', message), 'Not enough stock for Vine-ripened tomatoes. Available: 3 lb.');
  assert.equal(translate('zh', message), '藤熟番茄 库存不足，当前剩余 3 磅。');
  assert.equal(translate('en', '欢迎回来，{name}', { name: '青禾' }), 'Welcome back, 青禾');
  assert.equal(translate('en', '未收录的农场自定义文案'), '未收录的农场自定义文案');
  assert.equal(translate('en', '__proto__'), '__proto__');
  assert.equal(translate('en', null), '');
  assert.equal(translate('zh', '2 for $3.00'), '2 件 $3.00');
  assert.equal(matchesSearch(' TOMATO ', '藤熟番茄'), true);
  assert.equal(matchesSearch('藤熟', '藤熟番茄'), true);
  assert.equal(matchesSearch('学生中心', 'College Ave Student Center'), true);
  assert.equal(matchesSearch('spinach', '藤熟番茄'), false);
  assert.equal(quantityUnit('en', '颗', 1), 'head');
  assert.equal(quantityUnit('en', '颗', 0), 'heads');
  assert.equal(quantityUnit('en', '把', 3), 'bunches');
  assert.equal(quantityUnit('en', '个', 2), 'items');
  assert.equal(quantityUnit('zh', '把', 3), '把');
  assert.equal(translate('en', '剩余 {count} {unit}', { count: 2, unit: { unit: '袋', count: 2 } }), 'Remaining: 2 bags');
});
