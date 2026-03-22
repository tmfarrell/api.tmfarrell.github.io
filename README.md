# API Functions for tmfarrell.github.io

This is a standalone Netlify Functions deployment that provides semantic search and AI-powered chat for tmfarrell.github.io.

## Local Development

### Prerequisites

- Node.js installed
- Netlify CLI: `npm install -g netlify-cli`

### Running Locally

```bash
# Install dependencies
npm install

# Start local development server
netlify dev
```

This starts a local server (typically at http://localhost:8888) where you can test the functions.

### Testing the API Locally

Use the test scripts in the `tests/` directory:

```bash
# Test both endpoints (requires curl and jq)
./tests/test-local.sh

# Or test programmatically with Node.js
node tests/test-local.js
```

Manual curl commands also work:

```bash
# Test endpoint
curl http://localhost:8888/.netlify/functions/test

# Search endpoint
curl -X POST http://localhost:8888/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8888" \
  -d '{"query": "product management"}'

# Chat endpoint
curl -X POST http://localhost:8888/.netlify/functions/chat \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8888" \
  -d '{"query": "What is Tims background?"}'
```

## API Endpoints

Requests are validated by origin. Allowed origins:

- `http://localhost:8888`, `http://localhost:3000`, `http://localhost:8080`
- `http://127.0.0.1:8888`, `http://127.0.0.1:3000`, `http://127.0.0.1:8080`
- `https://tmfarrell.github.io` (production)

### GET /.netlify/functions/test

Test endpoint to verify deployment.

### POST /.netlify/functions/search

Semantic search endpoint using Pinecone.

**Request:**
```json
{
  "query": "your search query"
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "Post Title",
      "url": "https://tmfarrell.github.io/path/to/post/",
      "date": "Jan 15, 2024",
      "category": "Writing",
      "excerpt": "Post excerpt...",
      "score": 0.85
    }
  ],
  "query": "product management",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### POST /.netlify/functions/chat

AI-powered chat endpoint using Anthropic's Haiku model. Searches the knowledge base for relevant context and generates a concise response with links.

**Request:**
```json
{
  "query": "your question"
}
```

**Response:**
```json
{
  "response": "Tim is a product manager with experience in...",
  "sources": [
    {
      "title": "Related Post",
      "url": "https://tmfarrell.github.io/path/to/post/",
      "score": 0.85
    }
  ],
  "remainingRequests": 9
}
```

**Rate Limit:** 10 requests per minute per IP address.

## Error Handling

The API returns proper HTTP status codes:

- **200**: Success with results
- **400**: Invalid request (missing query, invalid JSON, etc.)
- **403**: Origin not allowed
- **429**: Rate limit exceeded (chat endpoint) or service quota exceeded (Pinecone)
- **500**: Server error
- **504**: Request timeout

## Environment Variables

Set these in Netlify dashboard or local `.env` file:

| Variable | Description |
|----------|-------------|
| `PINECONE_API_KEY` | Pinecone database API key |
| `PINECONE_INDEX` | Pinecone index name |
| `PINECONE_INDEX_HOST` | Pinecone index host URL |
| `PINECONE_NAMESPACE` | Pinecone namespace (optional) |
| `ANTHROPIC_API_KEY` | Anthropic API key for chat endpoint |

## Files

- `functions/constants.js` - Shared configuration (allowed origins)
- `functions/search.js` - Semantic search API endpoint
- `functions/chat.js` - AI chat API endpoint (Haiku model)
- `functions/test.js` - Health check/debug endpoint
- `tests/test-local.sh` - Bash script for local testing
- `tests/test-local.js` - Node.js script for local testing
- `tests/test-prod.sh` - Bash script for production testing
- `package.json` - Dependencies
- `netlify.toml` - Netlify configuration
- `.env` - Local environment variables (not committed)
- `README.md` - This file
