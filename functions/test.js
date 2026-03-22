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
      name: 'API Functions for tmfarrell.github.io',
      description: 'Semantic search and AI-powered chat API',
      timestamp: new Date().toISOString(),
      environment: {
        hasPinecone: !!process.env.PINECONE_API_KEY,
        hasIndex: !!process.env.PINECONE_INDEX,
        hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
        indexName: process.env.PINECONE_INDEX || 'not-set'
      },
      endpoints: {
        search: '/.netlify/functions/search',
        searchAlt: '/api/search',
        chat: '/.netlify/functions/chat',
        chatAlt: '/api/chat',
        test: '/.netlify/functions/test'
      },
      examples: {
        search: {
          method: 'POST',
          endpoint: '/api/search',
          body: { query: 'your search text' },
          curl: 'curl -X POST https://api-tmfarrell.netlify.app/api/search -H "Content-Type: application/json" -H "Origin: https://tmfarrell.github.io" -d \'{"query": "data science"}\''
        },
        chat: {
          method: 'POST',
          endpoint: '/api/chat',
          body: { query: 'your question' },
          curl: 'curl -X POST https://api-tmfarrell.netlify.app/api/chat -H "Content-Type: application/json" -H "Origin: https://tmfarrell.github.io" -d \'{"query": "What is Tims background?"}\'',
          rateLimit: '10 requests per minute per IP'
        }
      }
    })
  };
};
