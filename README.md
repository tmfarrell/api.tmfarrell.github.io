# API Functions for tmfarrell.github.io

This is a standalone Netlify Functions deployment that provides semantic search and AI-powered chat for tmfarrell.github.io.

## Local Development

### Prerequisites

- Node.js 22 or newer (`.nvmrc` pins 24, the current LTS and Netlify's default). Node 18 is too old for current `netlify-cli` and for the Pinecone SDK.
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

Unit tests (no API keys needed):

```bash
npm test
```

Model evals (needs keys in `.env`; makes paid Anthropic calls, about $0.25 for the default 26-question Haiku 4.5 vs 5.5 run):

```bash
npm run eval                                    # claude-haiku-4-5 vs claude-haiku-5-5
npm run eval -- --models claude-haiku-5-5,claude-sonnet-5-5
npm run eval -- --dry-run                       # retrieval + prompt only, no Anthropic calls
```

The eval sends the same retrieved context to each model and writes side-by-side answers, latency, tokens, estimated cost, stop reasons, and URL checks to `tests/eval-results/` (git-ignored). Questions live in `tests/evals.json`.

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

AI-powered chat endpoint using Anthropic's Claude Haiku 5.5 (`claude-haiku-5-5`, effort `low`) by default. It retrieves the top chunks from Pinecone, sends their full text (capped per chunk and in total) with recent conversation history, and returns a concise answer with links. The model may only link to URLs that appear in the retrieved context; any other markdown link is unlinked before the response is returned. Prompt, context, and history building live in `lib/chat-prompt.js`.

**Request:**
```json
{
  "query": "your question",
  "history": [
    { "role": "user", "content": "earlier question" },
    { "role": "assistant", "content": "earlier answer" }
  ]
}
```

`history` is optional. Only `user`/`assistant` string turns are used; the last 8 turns (2,000 chars each, 8,000 total) are kept, and a trailing copy of the current question is ignored.

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
| `CHAT_MODEL` | Optional. Overrides the chat model (default `claude-haiku-5-5`). Rollback: `claude-haiku-4-5` |

### Changing or rolling back the model

Set `CHAT_MODEL` in the Netlify dashboard and redeploy. To roll back to the previous model, set `CHAT_MODEL=claude-haiku-4-5` (the request automatically omits `effort`, which that model doesn't support). Or redeploy the previous Netlify deploy.

### Node version

Functions need Node 22+ (`@anthropic-ai/sdk` 1.x, `@pinecone-database/pinecone` 7.x). `.nvmrc` sets the build to Node 24, and Netlify Functions use the build's Node version. If the site pins an older version (Site configuration > Build & deploy > Dependency management, or an `AWS_LAMBDA_JS_RUNTIME` / `NODE_VERSION` env var), update it to 24.

## Files

- `functions/constants.js` - Shared configuration (allowed origins)
- `functions/search.js` - Semantic search API endpoint
- `functions/chat.js` - AI chat API endpoint (Claude Haiku 5.5 by default)
- `lib/chat-prompt.js` - System prompt, context, history, and response handling for chat
- `lib/retrieval.js` - Pinecone retrieval for chat
- `tests/unit/` - Unit tests (`npm test`, no keys needed)
- `tests/evals.json` - Eval questions; `tests/eval-models.js` - model comparison (`npm run eval`)
- `functions/test.js` - Health check/debug endpoint
- `tests/test-local.sh` - Bash script for local testing
- `tests/test-local.js` - Node.js script for local testing
- `tests/test-prod.sh` - Bash script for production testing
- `package.json` - Dependencies
- `netlify.toml` - Netlify configuration
- `.env` - Local environment variables (not committed)
- `README.md` - This file

## Follow-ups

- The chat rate limiter is in memory per function instance, so it resets on cold starts and isn't shared across instances. A shared store (for example Netlify Blobs) would make the 10/minute limit reliable.
- The site fakes streaming by typing out the full response. True streaming would need a streaming function and frontend changes.
