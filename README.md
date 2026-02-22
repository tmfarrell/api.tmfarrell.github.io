# Search API Functions for tmfarrell.github.io

This is a standalone Netlify Functions deployment that provides semantic search API for tmfarrell.github.io.

## Deployment Instructions

### 1. Create New Netlify Site from This Directory

```bash
# Navigate to this directory
cd api.tmfarrell.github.io

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - Search API functions"

# Create a GitHub repository for just the functions
# Then push this directory to that new repo
```

### 2. Connect to Netlify

1. Go to https://netlify.com
2. Click "New site from Git"
3. Choose GitHub and select your new functions repository
4. Use these settings:
   - **Base directory**: leave blank (or set to `api.tmfarrell.github.io` if you put this in a subdirectory)
   - **Build command**: leave blank (no build needed)
   - **Publish directory**: `.` (current directory)

### 4. Test Deployment

After deployment, your functions will be available at:

- **Test endpoint**: `https://your-functions-site.netlify.app/.netlify/functions/test`
- **Search endpoint**: `https://your-functions-site.netlify.app/.netlify/functions/search`
- **Clean URLs**: `https://your-functions-site.netlify.app/api/search` (via redirect)

## API Endpoints

### GET /.netlify/functions/test

Test endpoint to verify deployment.

**Example:**
```bash
curl https://your-functions-site.netlify.app/.netlify/functions/test
```

### POST /.netlify/functions/search

Semantic search endpoint.

**Request:**
```bash
curl -X POST https://your-functions-site.netlify.app/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -d '{"query": "product management"}'
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

## Integration with GitHub Pages Site

Once deployed, update your GitHub Pages site to call:

```javascript
// In your frontend JavaScript
const API_BASE_URL = 'https://your-functions-site.netlify.app';

fetch(`${API_BASE_URL}/.netlify/functions/search`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: 'your search query' })
})
.then(response => response.json())
.then(data => console.log(data.results));
```

## Local Testing

```bash
# Install dependencies
npm install

# Test the function locally (requires Netlify CLI)
npm install -g netlify-cli
netlify dev
```

## Error Handling

The API returns proper HTTP status codes:

- **200**: Success with results
- **400**: Invalid request (missing query, etc.)
- **429**: Rate limit exceeded (Pinecone quota hit)
- **500**: Server error
- **504**: Request timeout

Rate limit message matches your specification:
> "Too many users have been using this feature and we've hit the limit of our free-tier backend services! Please take a break and try this feature again soon, or email tfarrell01@gmail.com with any other questions you might have."

## Files

- `functions/search.js` - Main search API endpoint
- `functions/test.js` - Health check/debug endpoint
- `package.json` - Dependencies
- `netlify.toml` - Netlify configuration
- `README.md` - This file