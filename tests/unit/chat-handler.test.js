// Wiring test for functions/chat.js with Pinecone retrieval and the Anthropic client stubbed.
// No API keys or network needed. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const calls = [];
let nextMessage;

function stubModule(relOrName, exportsValue) {
  const resolved = require.resolve(relOrName);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}

stubModule(path.join(__dirname, '../../lib/retrieval.js'), {
  retrieveHits: async () => [
    { _score: 0.9, fields: { title: 'PhenOM API', url: '/building/phenom-api/', text: '[title: PhenOM API] Tim led the PhenOM API at OM1. [Category: portfolio]' } },
  ],
});

class FakeAnthropic {
  constructor() {
    this.messages = {
      stream: (params) => {
        calls.push(params);
        return { finalMessage: async () => nextMessage };
      },
    };
  }
}
stubModule('@anthropic-ai/sdk', FakeAnthropic);

process.env.PINECONE_API_KEY = 'test';
process.env.PINECONE_INDEX = 'test';
process.env.ANTHROPIC_API_KEY = 'test';
delete process.env.CHAT_MODEL;

const { handler } = require('../../functions/chat');

const event = (body, ip = '1.1.1.1') => ({
  httpMethod: 'POST',
  headers: { origin: 'https://tmfarrell.github.io', 'client-ip': ip },
  body: JSON.stringify(body),
});

test('chat handler builds the request and returns the answer with sources', async () => {
  nextMessage = {
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 20 },
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Tim led the [PhenOM API](https://tmfarrell.github.io/building/phenom-api/).' }],
  };
  const res = await handler(event({
    query: 'What did Tim build at OM1?',
    history: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello!' }, { role: 'user', content: 'What did Tim build at OM1?' }],
  }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.match(body.response, /\[PhenOM API\]\(https:\/\/tmfarrell\.github\.io\/building\/phenom-api\/\)/);
  assert.deepEqual(body.sources, [{ title: 'PhenOM API', url: 'https://tmfarrell.github.io/building/phenom-api/', score: 0.9 }]);
  assert.equal(typeof body.remainingRequests, 'number');

  const params = calls[calls.length - 1];
  assert.equal(params.model, 'claude-haiku-5-5');
  assert.deepEqual(params.output_config, { effort: 'low' });
  assert.deepEqual(params.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.match(params.messages[2].content, /Tim led the PhenOM API at OM1\./);
});

test('chat handler honors CHAT_MODEL rollback', async () => {
  process.env.CHAT_MODEL = 'claude-haiku-4-5';
  nextMessage = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
  const res = await handler(event({ query: 'hi' }, '2.2.2.2'));
  delete process.env.CHAT_MODEL;
  assert.equal(res.statusCode, 200);
  const params = calls[calls.length - 1];
  assert.equal(params.model, 'claude-haiku-4-5');
  assert.ok(!('output_config' in params));
});

test('chat handler returns a friendly message on refusal', async () => {
  nextMessage = { stop_reason: 'refusal', content: [] };
  const res = await handler(event({ query: 'something disallowed' }, '3.3.3.3'));
  assert.equal(res.statusCode, 200);
  assert.match(JSON.parse(res.body).response, /can't help with that/);
});

test('chat handler still validates input', async () => {
  assert.equal((await handler(event({ query: '' }, '4.4.4.4'))).statusCode, 400);
  assert.equal((await handler(event({ query: 'x'.repeat(501) }, '4.4.4.4'))).statusCode, 400);
  const bad = await handler({ httpMethod: 'POST', headers: { origin: 'https://evil.example.com' }, body: '{}' });
  assert.equal(bad.statusCode, 403);
});
