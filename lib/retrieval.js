// Retrieval from the Pinecone index used by the chat endpoint and the eval script.
const { Pinecone } = require('@pinecone-database/pinecone');
const { documentKey } = require('./chat-prompt');

// Legacy floor for embedding similarity. Rerank scores from pinecone-rerank-v0
// are orders of magnitude smaller, so retrieveHits does not apply it.
const MIN_SCORE = 0.1;
// Embedding candidates. Rerank then keeps RERANK_TOP_N.
const CANDIDATE_TOP_K = 30;
// Returned after rerank, before title+URL dedupe and the writing quota.
const RERANK_TOP_N = 20;
const RERANK_MODEL = 'pinecone-rerank-v0';

// Work and product questions keep at most this much writing. A question about
// writing, posts, or principles keeps every writing hit the reranker returned.
const MAX_WRITING_CHUNKS = 1;
const MAX_WRITING_CHARS = 4000;
const WRITING_QUESTION_RE = /\b(writings?|written|wrote|blog|essays?|articles?|posts?|principles?)\b/i;

function isWritingQuestion(query) {
  return WRITING_QUESTION_RE.test(String(query || ''));
}

function hitUrl(hit) {
  return String(hit?.fields?.url || '').trim();
}

function hitKey(hit) {
  const fields = (hit && hit.fields) || {};
  return documentKey(fields.url, fields.title);
}

function isWritingHit(hit) {
  const fields = (hit && hit.fields) || {};
  const categories = [fields.category, ...(Array.isArray(fields.categories) ? fields.categories : [])];
  if (categories.some((c) => String(c || '').toLowerCase().includes('writing'))) return true;
  return hitUrl(hit).includes('/writing/');
}

function hitChars(hit) {
  const fields = (hit && hit.fields) || {};
  return String(fields.text || fields.content_excerpt || '').length;
}

/**
 * Pinecone searchRecords body. `rerank` is a sibling of `query`. Nesting it
 * inside `query` drops it: the SDK serializes query as top_k, filter, and inputs.
 */
function buildSearchRequest(text, { topK, topN, filter } = {}) {
  const query = {
    topK,
    inputs: { text },
  };
  if (filter) query.filter = filter;
  return {
    query,
    rerank: {
      model: RERANK_MODEL,
      rankFields: ['text'],
      topN,
      // pinecone-rerank-v0 allows 512 tokens per query+document pair. Writing
      // chunks are longer than that. Truncate only the rerank input.
      parameters: { truncate: 'END' },
    },
  };
}

/**
 * When the top rerank score is a clear match (>= 0.05) and the rest are a
 * collapsed tail, keep the match. Product queries score the useful cards in
 * that tail (often under 0.01), so those lists are left intact.
 */
function dropCollapsedTail(hits) {
  const ranked = [...(Array.isArray(hits) ? hits : [])].sort((a, b) => (b._score || 0) - (a._score || 0));
  if (!ranked.length) return ranked;
  const top = ranked[0]._score || 0;
  if (top < 0.05) return ranked;
  // 0.5% of the top score. Day Zero's project cards sit just under 2% of the
  // job-page score; contact's tail is far below this.
  const floor = top * 0.005;
  return ranked.filter((hit) => (hit._score || 0) >= floor);
}

// Highest-scoring chunk per title and URL. Two chunks of one essay collapse.
// Two roles that link to the same company site both stay. Work questions keep one writing chunk.
function selectHits(hits, query) {
  const ranked = [...(Array.isArray(hits) ? hits : [])].sort((a, b) => (b._score || 0) - (a._score || 0));
  const allowWriting = isWritingQuestion(query);
  const seen = new Set();
  let writingChunks = 0;
  let writingChars = 0;
  const selected = [];

  for (const hit of ranked) {
    const key = hitKey(hit);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (!allowWriting && isWritingHit(hit)) {
      const chars = hitChars(hit);
      if (writingChunks >= MAX_WRITING_CHUNKS || writingChars >= MAX_WRITING_CHARS) continue;
      writingChunks += 1;
      writingChars += chars;
    }
    selected.push(hit);
  }
  return selected;
}

async function searchHits(index, namespace, text, { topK, topN, filter }) {
  const searchResult = await index.namespace(namespace).searchRecords(
    buildSearchRequest(text, { topK, topN, filter }),
  );
  return searchResult.result?.hits || [];
}

async function retrieveHits(query, env = process.env, opts = {}) {
  const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  const index = pinecone.index({ name: env.PINECONE_INDEX, host: env.PINECONE_INDEX_HOST });
  const writingQuery = opts.writingQuery != null ? opts.writingQuery : query;
  const namespace = env.PINECONE_NAMESPACE;

  // Essays about "products" outrank the project cards when they share one
  // candidate pool. Work questions search those pools separately, then keep
  // a single writing chunk. Writing questions use one combined search.
  let hits;
  if (isWritingQuestion(writingQuery)) {
    hits = dropCollapsedTail(await searchHits(index, namespace, query, {
      topK: CANDIDATE_TOP_K,
      topN: RERANK_TOP_N,
      filter: { category: { $ne: 'reading' } },
    }));
  } else {
    const [workHits, writingHits] = await Promise.all([
      searchHits(index, namespace, query, {
        topK: CANDIDATE_TOP_K,
        topN: RERANK_TOP_N,
        filter: { category: { $nin: ['reading', 'writing'] } },
      }),
      searchHits(index, namespace, query, {
        topK: 10,
        topN: 3,
        filter: { category: { $eq: 'writing' } },
      }),
    ]);
    hits = [...dropCollapsedTail(workHits), ...dropCollapsedTail(writingHits)];
  }

  return selectHits(hits, writingQuery);
}

module.exports = {
  retrieveHits,
  selectHits,
  dropCollapsedTail,
  buildSearchRequest,
  isWritingQuestion,
  isWritingHit,
  MIN_SCORE,
  CANDIDATE_TOP_K,
  RERANK_TOP_N,
  MAX_WRITING_CHUNKS,
  MAX_WRITING_CHARS,
};
