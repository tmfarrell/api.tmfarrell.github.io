// Unit tests for retrieval selection. No API keys or network needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../../lib/retrieval');

const hit = (fields, score) => ({ _score: score, fields });

test('buildSearchRequest puts rerank next to query', () => {
  const req = r.buildSearchRequest('What products has Tim worked on?', {
    topK: r.CANDIDATE_TOP_K,
    topN: r.RERANK_TOP_N,
    filter: { category: { $ne: 'reading' } },
  });
  assert.equal(req.query.topK, 30);
  assert.equal(req.query.inputs.text, 'What products has Tim worked on?');
  assert.deepEqual(req.query.filter, { category: { $ne: 'reading' } });
  assert.equal(req.rerank.model, 'pinecone-rerank-v0');
  assert.deepEqual(req.rerank.rankFields, ['text']);
  assert.equal(req.rerank.topN, 20);
  assert.deepEqual(req.rerank.parameters, { truncate: 'END' });
  assert.equal(req.query.rerank, undefined);
});

test('selectHits keeps one chunk per page and keeps roles that share a URL', () => {
  const selected = r.selectHits([
    hit({ title: 'Essay', url: '/writing/2022/12/03/projects_v_products/', text: 'later chunk', category: 'writing' }, 0.4),
    hit({ title: 'Essay', url: 'https://tmfarrell.github.io/writing/2022/12/03/projects_v_products/', text: 'best chunk', category: 'writing' }, 0.8),
    hit({ title: 'PhenOM', url: '/assets/pdf/phenom_platform.pdf', text: 'PhenOM platform', category: 'portfolio' }, 0.5),
    hit({ title: 'Product Manager at Day Zero Diagnostics', url: 'https://www.dayzerodiagnostics.com/', text: 'Led product', category: 'experience' }, 0.3),
    hit({ title: 'Bioinformatics Engineer at Day Zero Diagnostics', url: 'https://www.dayzerodiagnostics.com/', text: 'Built a data platform', category: 'experience' }, 0.2),
  ], 'What products has Tim worked on?');
  assert.deepEqual(selected.map((h) => h.fields.text), ['best chunk', 'PhenOM platform', 'Led product', 'Built a data platform']);
});

test('dropCollapsedTail keeps a clear top hit and keeps flat low-score lists', () => {
  const contact = r.dropCollapsedTail([
    hit({ title: 'Contact', url: '/a', text: 'email' }, 0.175),
    hit({ title: 'epiXact', url: '/b', text: 'x' }, 0.00002),
  ]);
  assert.deepEqual(contact.map((h) => h.fields.title), ['Contact']);

  const products = r.dropCollapsedTail([
    hit({ title: 'Portfolio', url: '/a', text: 'p' }, 0.0012),
    hit({ title: 'PhenOM', url: '/b', text: 'PhenOM' }, 0.00004),
  ]);
  assert.deepEqual(products.map((h) => h.fields.title), ['Portfolio', 'PhenOM']);

  const dzd = r.dropCollapsedTail([
    hit({ title: 'Day Zero', url: '/a', text: 'engineer' }, 0.0685),
    hit({ title: 'epiXact', url: '/b', text: 'epiXact' }, 0.0008),
    hit({ title: 'Portfolio', url: '/c', text: 'browse' }, 0.0001),
  ]);
  assert.deepEqual(dzd.map((h) => h.fields.title), ['Day Zero', 'epiXact']);
});

test('selectHits keeps a single writing chunk unless the question is about writing', () => {
  const hits = [
    hit({ title: 'Essay A', url: '/writing/a/', text: 'a'.repeat(3000), category: 'writing' }, 0.9),
    hit({ title: 'Essay B', url: '/writing/b/', text: 'principles of product work', category: 'writing' }, 0.7),
    hit({ title: 'PhenOM', url: '/assets/pdf/phenom_platform.pdf', text: 'PhenOM', category: 'portfolio' }, 0.6),
    hit({ title: 'epiXact', url: '/assets/pdf/epixact.pdf', text: 'epiXact', category: 'portfolio' }, 0.5),
  ];
  const products = r.selectHits(hits, 'What products has Tim worked on?');
  assert.deepEqual(products.map((h) => h.fields.title), ['Essay A', 'PhenOM', 'epiXact']);

  const principles = r.selectHits(hits, "What are Tim's product principles?");
  assert.deepEqual(principles.map((h) => h.fields.title), ['Essay A', 'Essay B', 'PhenOM', 'epiXact']);
  assert.equal(r.isWritingQuestion('What products has Tim worked on?'), false);
  assert.equal(r.isWritingQuestion("What are Tim's product principles?"), true);
});
