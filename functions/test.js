// Test endpoint to verify deployment and configuration
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'api-tmfarrell.netlify.app',
      timestamp: new Date().toISOString(),
      environment: {
        hasApiKey: !!process.env.PINECONE_API_KEY,
        hasIndex: !!process.env.PINECONE_INDEX,
        nodeVersion: process.version,
        apiKeyLength: process.env.PINECONE_API_KEY ? process.env.PINECONE_API_KEY.length : 0,
        indexName: process.env.PINECONE_INDEX || 'not-set'
      },
      endpoints: {
        search: '/.netlify/functions/search',
        test: '/.netlify/functions/test'
      },
      usage: {
        search_endpoint: 'POST /.netlify/functions/search with JSON body: {"query": "your search text"}',
        example: 'curl -X POST https://api-tmfarrell.netlify.app/.netlify/functions/search -H "Content-Type: application/json" -d \'{"query": "data science"}\''
      }
    })
  };
};