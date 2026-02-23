# Search API Functions for tmfarrell.github.io

This is a standalone Netlify Functions deployment that provides semantic search API for tmfarrell.github.io.

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

```bash
# Test endpoint
curl http://localhost:8888/.netlify/functions/test

# Search endpoint
curl -X POST http://localhost:8888/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -d '{"query": "product management"}'
```

## API Endpoints

### GET /.netlify/functions/test

Test endpoint to verify deployment.

### POST /.netlify/functions/search

Semantic search endpoint.

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

## Error Handling

The API returns proper HTTP status codes:

- **200**: Success with results
- **400**: Invalid request (missing query, etc.)
- **429**: Rate limit exceeded (Pinecone quota hit)
- **500**: Server error
- **504**: Request timeout

## Files

- `functions/search.js` - Main search API endpoint
- `functions/test.js` - Health check/debug endpoint
- `package.json` - Dependencies
- `netlify.toml` - Netlify configuration
- `README.md` - This file
