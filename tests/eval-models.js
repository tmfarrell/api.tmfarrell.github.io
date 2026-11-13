#!/usr/bin/env node
// Compares chat models on the same retrieved context.
//
// Usage (needs PINECONE_* and ANTHROPIC_API_KEY in .env; makes paid API calls):
//   npm run eval                                   # claude-haiku-4-5 vs claude-haiku-5-5
//   npm run eval -- --models claude-haiku-5-5,claude-sonnet-5-5
//   npm run eval -- --ids fact-om1,injection-link  # a subset
//   npm run eval -- --dry-run                      # retrieval + prompt only, no Anthropic calls
//
// For each question it retrieves context once from Pinecone, sends the identical request
// (built by lib/chat-prompt.js, same as production) to every model, and records the answer,
// latency, token usage, estimated cost, stop_reason, and whether every URL in the answer is
// one of the retrieved sources / appears in the retrieved context. Results are written to
// tests/eval-results/<timestamp>.json and .md (git-ignored) for side-by-side grading.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const Anthropic = require('@anthropic-ai/sdk');
const { retrieveHits } = require('../lib/retrieval');
const p = require('../lib/chat-prompt');

// USD per million tokens (input, output). Thinking tokens bill as output.
// Source: https://docs.anthropic.com/en/docs/about-claude/pricing (checked 2026-11-13).
const PRICES = {
  'claude-haiku-4-5': [1, 5],
  'claude-haiku-5-5': [0.1, 0.5], // prompts up to 100k tokens
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-opus-5-5': [4, 20],
};

const NOT_COVERED_RE = /(don't|do not|doesn't|does not|can't|cannot|couldn't|isn't|is not|no) (see|find|have|cover|mention|include|information|details|share|available)|not (covered|mentioned|available|something)|isn't (on|covered)/i;
const DECLINE_RE = /(can't|cannot|won't|not able to|unable to|outside|beyond|only (help|answer)|here to (help|answer))/i;
const PREAMBLE_RE = /based on (the )?(context|information|documents?) (provided|given|above)/i;

function parseArgs(argv) {
  const args = { models: ['claude-haiku-4-5', 'claude-haiku-5-5'], ids: null, dryRun: false, file: path.join(__dirname, 'evals.json') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') args.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--ids') args.ids = new Set(argv[++i].split(',').map((s) => s.trim()));
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--file') args.file = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 16).join('\n')); process.exit(0); }
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function priceFor(model) {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  return key ? PRICES[key] : null;
}

function estCost(model, usage) {
  const price = priceFor(model);
  if (!price || !usage) return null;
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return (input * price[0] + (usage.output_tokens || 0) * price[1]) / 1e6;
}

function checkExpectations(expect = {}, text) {
  const failures = [];
  const lower = text.toLowerCase();
  if (expect.mentionAny && !expect.mentionAny.some((s) => lower.includes(s.toLowerCase()))) failures.push(`mentions none of: ${expect.mentionAny.join(', ')}`);
  for (const s of expect.mentionNone || []) if (text.includes(s)) failures.push(`mentions forbidden: ${s}`);
  if (expect.link && !/\[[^\]]+\]\([^)]+\)/.test(text)) failures.push('no markdown link');
  if (expect.notCovered && !NOT_COVERED_RE.test(text)) failures.push('does not say it is not covered');
  if (expect.decline && !DECLINE_RE.test(text)) failures.push('does not decline');
  if (PREAMBLE_RE.test(text)) failures.push('uses "based on the context" preamble');
  return failures;
}

function percentile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['PINECONE_API_KEY', 'PINECONE_INDEX', ...(args.dryRun ? [] : ['ANTHROPIC_API_KEY'])];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')} (set them in .env)`);

  const evals = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  const questions = evals.questions.filter((q) => !args.ids || args.ids.has(q.id));
  console.log(`${questions.length} questions x ${args.models.length} models${args.dryRun ? ' (dry run: no Anthropic calls)' : ` = ${questions.length * args.models.length} paid API calls`}`);

  const anthropic = args.dryRun ? null : new Anthropic();
  const results = [];

  for (const q of questions) {
    const t0 = Date.now();
    const hits = await retrieveHits(q.question);
    const retrievalMs = Date.now() - t0;
    const { documents, sources, contextText } = p.buildContext(hits);
    const sourceSet = new Set(sources.map((s) => p.normalizeUrl(s.url)));
    const allowed = p.allowedUrlSet(documents);
    const row = { id: q.id, category: q.category, question: q.question, retrievalMs, sources, contextChars: contextText.length, answers: {} };

    for (const model of args.models) {
      const params = p.buildChatRequest({ model, query: q.question, contextText, history: q.history });
      if (args.dryRun) {
        row.answers[model] = { dryRun: true, historyTurns: params.messages.length - 1, promptChars: params.system.length + params.messages.reduce((n, m) => n + m.content.length, 0) };
        continue;
      }
      const start = Date.now();
      let message; let error = null;
      try {
        message = await anthropic.messages.stream(params).finalMessage();
      } catch (e) {
        error = `${e.status || ''} ${e.message}`.trim();
      }
      const latencyMs = Date.now() - start;
      if (error) { row.answers[model] = { error, latencyMs }; console.log(`  ${q.id} ${model}: ERROR ${error}`); continue; }

      const rawText = p.extractText(message);
      const final = p.finalizeResponse(message, documents);
      const urls = p.findUrls(rawText);
      const urlsNotInSources = urls.filter((u) => !sourceSet.has(p.normalizeUrl(u.startsWith('/') ? p.absoluteUrl(u) : u)));
      const urlsNotInContext = urls.filter((u) => !p.isAllowedUrl(u, allowed));
      const failures = checkExpectations(q.expect, final.text);
      if (urlsNotInContext.length) failures.push(`URLs not in retrieved context: ${urlsNotInContext.join(', ')}`);
      if (['max_tokens', 'refusal'].includes(message.stop_reason) && q.category !== 'off-topic') failures.push(`stop_reason ${message.stop_reason}`);

      row.answers[model] = {
        text: final.text,
        rawText,
        stopReason: message.stop_reason,
        latencyMs,
        usage: message.usage,
        estCostUsd: estCost(model, message.usage),
        urls,
        urlsNotInSources,
        urlsNotInContext,
        removedLinks: final.removedLinks,
        autoChecksPassed: failures.length === 0,
        failures,
      };
      console.log(`  ${q.id} ${model}: ${message.stop_reason} ${latencyMs}ms in=${message.usage?.input_tokens} out=${message.usage?.output_tokens} ${failures.length ? 'FAIL ' + failures.join('; ') : 'ok'}`);
    }
    results.push(row);
  }

  const summary = {};
  for (const model of args.models) {
    const answers = results.map((r) => r.answers[model]).filter((a) => a && !a.dryRun);
    const ok = answers.filter((a) => !a.error);
    const lat = ok.map((a) => a.latencyMs);
    summary[model] = {
      answered: ok.length,
      errors: answers.length - ok.length,
      autoChecksPassed: ok.filter((a) => a.autoChecksPassed).length,
      latencyP50Ms: percentile(lat, 0.5),
      latencyP95Ms: percentile(lat, 0.95),
      avgInputTokens: ok.length ? Math.round(ok.reduce((n, a) => n + (a.usage?.input_tokens || 0), 0) / ok.length) : null,
      avgOutputTokens: ok.length ? Math.round(ok.reduce((n, a) => n + (a.usage?.output_tokens || 0), 0) / ok.length) : null,
      totalEstCostUsd: ok.reduce((n, a) => n + (a.estCostUsd || 0), 0),
      stopReasons: ok.reduce((acc, a) => ({ ...acc, [a.stopReason]: (acc[a.stopReason] || 0) + 1 }), {}),
      answersWithUrlsNotInSources: ok.filter((a) => a.urlsNotInSources.length).length,
      answersWithUrlsNotInContext: ok.filter((a) => a.urlsNotInContext.length).length,
    };
  }

  const outDir = path.join(__dirname, 'eval-results');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ createdAt: new Date().toISOString(), models: args.models, dryRun: args.dryRun, summary, results }, null, 2));

  const md = [`# Chat eval ${stamp}`, '', `Models: ${args.models.join(', ')}`, ''];
  if (!args.dryRun) {
    md.push('| model | auto-checks passed | p50 ms | p95 ms | avg in tok | avg out tok | est. cost | stop reasons | URLs not in context |', '|---|---|---|---|---|---|---|---|---|');
    for (const [m, s] of Object.entries(summary)) {
      md.push(`| ${m} | ${s.autoChecksPassed}/${s.answered} | ${s.latencyP50Ms} | ${s.latencyP95Ms} | ${s.avgInputTokens} | ${s.avgOutputTokens} | $${s.totalEstCostUsd.toFixed(4)} | ${JSON.stringify(s.stopReasons)} | ${s.answersWithUrlsNotInContext} |`);
    }
    md.push('');
  }
  for (const r of results) {
    md.push(`## ${r.id} (${r.category})`, '', `**Q:** ${r.question}`, '', `Sources: ${r.sources.map((s) => s.url).join(', ') || 'none'}`, '');
    for (const [m, a] of Object.entries(r.answers)) {
      if (a.dryRun) { md.push(`- ${m}: dry run, ${a.historyTurns} history turns, ${a.promptChars} prompt chars`); continue; }
      if (a.error) { md.push(`### ${m}`, '', `ERROR: ${a.error}`, ''); continue; }
      md.push(`### ${m} (${a.stopReason}, ${a.latencyMs} ms, ${a.usage?.input_tokens}/${a.usage?.output_tokens} tok)`, '', a.text, '', a.failures.length ? `Auto-check failures: ${a.failures.join('; ')}` : 'Auto-checks: passed', '', 'Grade (1-5): correct __ links __ concise __ honest __ safe __', '');
    }
    md.push('');
  }
  const mdPath = jsonPath.replace(/\.json$/, '.md');
  fs.writeFileSync(mdPath, md.join('\n'));

  console.log('\nSummary:');
  console.table(summary);
  console.log(`\nWrote ${path.relative(process.cwd(), jsonPath)} and ${path.relative(process.cwd(), mdPath)}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
