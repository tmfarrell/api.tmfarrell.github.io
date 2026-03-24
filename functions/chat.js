const { Pinecone } = require('@pinecone-database/pinecone');
const Anthropic = require('@anthropic-ai/sdk');
const { isAllowedOrigin } = require('./constants');

const rateLimitMap = new Map();

const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }
  
  if (now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache'
};

exports.handler = async (event, context) => {
  const clientIp = (event.headers && (event.headers['client-ip'] || event.headers['x-forwarded-for'])) || 'unknown';
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (!isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Origin not allowed' })
    };
  }
  
  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 200, 
      headers,
      body: JSON.stringify({ message: 'CORS preflight OK' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  const rateLimitResult = checkRateLimit(clientIp);
  if (!rateLimitResult.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ 
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: 60
      })
    };
  }

  try {
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { query } = requestBody;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required and must be a non-empty string' })
      };
    }

    if (query.trim().length > 500) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is too long. Maximum 500 characters allowed.' })
      };
    }

    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX || !process.env.ANTHROPIC_API_KEY) {
      console.error('Required environment variables are not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'service_configuration_error',
          message: 'Service configuration error' 
        })
      };
    }

    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.index({ 
      name: process.env.PINECONE_INDEX, 
      host: process.env.PINECONE_INDEX_HOST
    });

    console.log(`[${new Date().toISOString()}] Chat searching for: "${query.trim()}"`);
    
    const searchResult = await index.namespace(process.env.PINECONE_NAMESPACE).searchRecords({
      query: {
        topK: 10,
        inputs: { text: query.trim() },
        filter: { category: { $ne: "reading" } },
        rerank: {
          model: 'pinecone-rerank-v0',
          rankFields: ['text'],
          topN: 5,
        }
      }
    });

    const hits = searchResult.result?.hits || [];
    const filteredHits = hits.filter(hit => hit._score > 0.1);

    let contextText = '';
    if (filteredHits.length > 0) {
      contextText = filteredHits.map(hit => {
        const fields = hit.fields || {};
        const title = fields.title || 'Untitled';
        const url = fields.url || '#';
        const content = fields.content_excerpt || fields.text || '';
        return `Title: ${title}\nURL: ${url}\nContent: ${content}`;
      }).join('\n\n---\n\n');
    } else {
      contextText = 'No relevant context found from the search.';
    }

    console.log(`[${new Date().toISOString()}] Found ${filteredHits.length} relevant results`);

    const anthropic = new Anthropic();
    const response = await anthropic.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a helpful assistant answering questions about Tim Farrell's content (tmfarrell.github.io). Use the following context to answer the user's question concisely.

Context from the knowledge base:
${contextText}

User question: ${query.trim()}

Instructions:
- Keep your response concise and direct
- You should answer as if you an expert in the content of tmfarrell.github.io. For example, don't say "Based on the information provided" or "Based on the context provided". Just answer the question.
- Preserve and include links to relevant pages when appropriate (format as markdown links: [Page Title](URL))
- If the context doesn't contain enough information to answer, say so but still provide what help you can
- Be friendly and helpful`
      }]
    });

    let fullResponse = '';
    for await (const event of response) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        fullResponse += event.delta.text;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: fullResponse.trim(),
        sources: filteredHits.map(hit => ({
          title: hit.fields?.title || 'Untitled',
          url: hit.fields?.url || '#',
          score: hit._score
        })),
        remainingRequests: rateLimitResult.remaining
      })
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Chat error:`, error);
    
    if (error.message?.includes('429') || error.status === 429) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'service_limit_exceeded',
          message: 'AI service rate limit exceeded. Please try again later.'
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'internal_server_error',
        message: 'An unexpected error occurred while processing your request. Please try again later.'
      })
    };
  }
};
