// Retrieval from the Pinecone index used by the chat endpoint and the eval script.
const { Pinecone } = require('@pinecone-database/pinecone');

const MIN_SCORE = 0.1;

async function retrieveHits(query, env = process.env) {
  const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  const index = pinecone.index({ name: env.PINECONE_INDEX, host: env.PINECONE_INDEX_HOST });

  const searchResult = await index.namespace(env.PINECONE_NAMESPACE).searchRecords({
    query: {
      topK: 10,
      inputs: { text: query },
      filter: { category: { $ne: 'reading' } },
      rerank: {
        model: 'pinecone-rerank-v0',
        rankFields: ['text'],
        topN: 5,
      },
    },
  });

  const hits = searchResult.result?.hits || [];
  return hits.filter((hit) => hit._score > MIN_SCORE);
}

module.exports = { retrieveHits, MIN_SCORE };
