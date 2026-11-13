const Anthropic = require('@anthropic-ai/sdk');
const { isAllowedOrigin } = require('./constants');
const { retrieveHits } = require('../lib/retrieval');
const {
  MAX_QUERY_CHARS,
  resolveModel,
  buildContext,
  buildChatRequest,
  finalizeResponse,
} = require('../lib/chat-prompt');

// Note: this limiter is per function instance (in memory), so it resets on cold starts
// and isn't shared across instances. See README "Follow-ups".
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

    const { query, history } = requestBody;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is required and must be a non-empty string' })
      };
    }

    if (query.trim().length > MAX_QUERY_CHARS) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Query is too long. Maximum ${MAX_QUERY_CHARS} characters allowed.` })
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

    const trimmedQuery = query.trim();
    console.log(`[${new Date().toISOString()}] Chat searching for: "${trimmedQuery}"`);

    const hits = await retrieveHits(trimmedQuery);
    const { documents, sources, contextText } = buildContext(hits);

    console.log(`[${new Date().toISOString()}] Found ${hits.length} relevant results (${contextText.length} context chars)`);

    const model = resolveModel();
    const params = buildChatRequest({ model, query: trimmedQuery, contextText, history });

    const anthropic = new Anthropic();
    const startedAt = Date.now();
    const message = await anthropic.messages.stream(params).finalMessage();
    const { text, stopReason, removedLinks } = finalizeResponse(message, documents);

    console.log(`[${new Date().toISOString()}] model=${model} stop_reason=${stopReason} latency_ms=${Date.now() - startedAt} ` +
      `input_tokens=${message.usage?.input_tokens} output_tokens=${message.usage?.output_tokens} history_turns=${params.messages.length - 1}` +
      (removedLinks.length ? ` removed_links=${removedLinks.length}` : ''));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: text,
        sources,
        remainingRequests: rateLimitResult.remaining
      })
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Chat error:`, error);
    
    if (error.message?.includes('429') || error.status === 429 || error.status === 529) {
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
