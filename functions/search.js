const { Pinecone } = require('@pinecone-database/pinecone');

exports.handler = async (event, context) => {
  // Enhanced CORS headers for GitHub Pages integration
  const headers = {
    'Access-Control-Allow-Origin': '*', // Allow any origin including tmfarrell.github.io
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 200, 
      headers,
      body: JSON.stringify({ message: 'CORS preflight OK' })
    };
  }

  // Only allow POST requests for actual search
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' })
    };
  }

  try {
    // Parse and validate request body
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

    // Limit query length for security
    if (query.trim().length > 500) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query is too long. Maximum 500 characters allowed.' })
      };
    }

    // Check for environment variables
    if (!process.env.PINECONE_API_KEY) {
      console.error('PINECONE_API_KEY environment variable is not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'service_configuration_error',
          message: 'Search service configuration error' 
        })
      };
    }

    if (!process.env.PINECONE_INDEX) {
      console.error('PINECONE_INDEX environment variable is not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'service_configuration_error',
          message: 'Search service configuration error' 
        })
      };
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    const index = pinecone.index({ name: process.env.PINECONE_INDEX, host: process.env.PINECONE_INDEX_HOST});
    
    console.log(`[${new Date().toISOString()}] Searching for: "${query.trim()}"`);
    
    // Query Pinecone
    const searchResult = await index.namespace(process.env.PINECONE_NAMESPACE).searchRecords({
      query: {
        topK: 5,
        inputs: { text: query.trim() },
        rerank: {
          model: 'pinecone-rerank-v0',
          rankFields: ['text'],
          topN: 5,
        }
      }
    });

    const hits = searchResult.result?.hits || [];
    console.log(`[${new Date().toISOString()}] Found ${hits.length} results`);

    // Format results for frontend
    const results = hits.map(hit => {
      const fields = hit.fields || {};
      
      // Extract metadata from the hit fields
      const title = fields.title || 'Untitled';
      const url = fields.url || '#';
      const date = fields.date || '';
      const category = fields.categories?.[0] || fields.category || '';
      const tags = fields.tags || [];
      const excerpt = fields.content_excerpt || fields.text?.substring(0, 200) + '...' || 'No preview available';

      return {
        title: sanitizeText(title),
        url: sanitizeUrl(url),
        date: formatDate(date),
        category: formatCategory(category),
        tags: Array.isArray(tags) ? tags : [],
        excerpt: sanitizeExcerpt(excerpt),
        score: Math.max(0, Math.min(1, hit._score || 0)) // Ensure score is between 0 and 1
      };
    });

    // Filter out results with very low scores (less than 10% relevance)
    const filteredResults = results.filter(result => result.score > 0.1);

    console.log(`[${new Date().toISOString()}] Returning ${filteredResults.length} filtered results`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        results: filteredResults,
        query: query.trim(),
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Search error:`, error);
    
    // Check if it's a Pinecone rate limit error
    if (error.message?.includes('RESOURCE_EXHAUSTED') || 
        error.message?.includes('429') ||
        error.message?.includes('quota') ||
        error.message?.includes('rate limit') ||
        error.status === 429) {
      console.log('Rate limit error detected');
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          error: 'service_limit_exceeded',
          message: "Too many users have been using this feature and we've hit the limit of our free-tier backend services! Please take a break and try this feature again soon, or email tfarrell01@gmail.com with any other questions you might have."
        })
      };
    }



    // Check for authentication errors
    if (error.message?.includes('Unauthorized') || 
        error.message?.includes('authentication') ||
        error.message?.includes('401') ||
        error.status === 401) {
      console.log('Authentication error detected');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'service_configuration_error',
          message: 'Search service authentication failed'
        })
      };
    }

    // Generic server error
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'internal_server_error',
        message: 'An unexpected error occurred while processing your search. Please try again later.'
      })
    };
  }
};

// Helper functions
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').trim().substring(0, 200);
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  
  // Ensure URLs are properly formatted
  if (url.startsWith('/')) {
    return `https://tmfarrell.github.io${url}`;
  }
  if (url.startsWith('http')) {
    return url;
  }
  return `https://tmfarrell.github.io/${url}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

function formatCategory(category) {
  if (!category) return '';
  
  return category.toLowerCase();
}

function sanitizeExcerpt(excerpt) {
  if (!excerpt) return 'No preview available';
  
  // Remove any HTML tags and limit length
  const cleaned = excerpt
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?;:-]/g, '') // Remove potentially unsafe characters
    .trim();
    
  if (cleaned.length > 250) {
    return cleaned.substring(0, 247) + '...';
  }
  
  return cleaned || 'No preview available';
}