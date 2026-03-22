#!/usr/bin/env node

// Local test script for the standalone search functions
// Run with: node test-local.js

// Load environment variables from parent directory
require('dotenv').config({ path: '.env' });

const { handler: searchHandler } = require('../functions/search.js');
const { handler: chatHandler } = require('../functions/chat.js');
const { handler: testHandler } = require('../functions/test.js');

async function testFunctions() {
  console.log('Testing Standalone Search & Chat Functions\n');
  console.log('Environment check:');
  console.log('- Pinecone API Key set:', !!process.env.PINECONE_API_KEY);
  console.log('- Index set:', !!process.env.PINECONE_INDEX);
  console.log('- Anthropic API Key set:', !!process.env.ANTHROPIC_API_KEY);
  console.log('');

  // Test 1: Test endpoint
  console.log('Test 1: Test endpoint');
  try {
    const testResult = await testHandler({ httpMethod: 'GET' }, {});
    console.log('Status:', testResult.statusCode);
    
    if (testResult.statusCode === 200) {
      const data = JSON.parse(testResult.body);
      console.log('Test endpoint working');
      console.log('  - Has Index:', data.environment.hasIndex);
      console.log('  - Index Name:', data.environment.indexName);
    }
  } catch (error) {
    console.error('Test endpoint failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Search with valid query
  console.log('Test 2: Search with valid query');
  const searchEvent = {
    httpMethod: 'POST',
    headers: { origin: 'http://localhost:8888' },
    body: JSON.stringify({ query: 'data science' })
  };

  try {
    const searchResult = await searchHandler(searchEvent, {});
    console.log('Status:', searchResult.statusCode);
    
    if (searchResult.statusCode === 200) {
      const data = JSON.parse(searchResult.body);
      console.log('Search successful');
      console.log(`  - Found ${data.results?.length || 0} results`);
      if (data.results && data.results.length > 0) {
        console.log(`  - First result: ${data.results[0].title}`);
        console.log(`  - Score: ${Math.round(data.results[0].score * 100)}%`);
      }
    } else {
      const error = JSON.parse(searchResult.body);
      console.log('Search failed:', error.message);
    }
  } catch (error) {
    console.error('Search error:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: Chat endpoint
  console.log('Test 3: Chat endpoint');
  const chatEvent = {
    httpMethod: 'POST',
    headers: { origin: 'http://localhost:8888' },
    body: JSON.stringify({ query: 'What is Tims background?' })
  };

  try {
    const chatResult = await chatHandler(chatEvent, {});
    console.log('Status:', chatResult.statusCode);
    
    if (chatResult.statusCode === 200) {
      const data = JSON.parse(chatResult.body);
      console.log('Chat successful');
      console.log(`  - Response length: ${data.response?.length || 0} chars`);
      console.log(`  - Sources: ${data.sources?.length || 0}`);
      console.log(`  - Remaining requests: ${data.remainingRequests}`);
      console.log(`  - Response preview: ${data.response?.substring(0, 100)}...`);
    } else {
      const error = JSON.parse(chatResult.body);
      console.log('Chat failed:', error.message);
    }
  } catch (error) {
    console.error('Chat error:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 4: CORS preflight
  console.log('Test 4: CORS preflight request');
  const corsEvent = { httpMethod: 'OPTIONS' };

  try {
    const corsResult = await searchHandler(corsEvent, {});
    console.log('Status:', corsResult.statusCode);
    console.log('CORS headers:', !!corsResult.headers['Access-Control-Allow-Origin']);
  } catch (error) {
    console.error('CORS test failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 5: Origin validation
  console.log('Test 5: Origin validation (invalid origin)');
  const badOriginEvent = {
    httpMethod: 'POST',
    headers: { origin: 'https://evil-site.com' },
    body: JSON.stringify({ query: 'test' })
  };

  try {
    const badOriginResult = await searchHandler(badOriginEvent, {});
    console.log('Status:', badOriginResult.statusCode);
    if (badOriginResult.statusCode === 403) {
      console.log('Origin validation working correctly');
    }
  } catch (error) {
    console.error('Origin test failed:', error.message);
  }

  console.log('\nLocal testing complete!');
}

// Check environment
if (!process.env.PINECONE_API_KEY) {
  console.error('PINECONE_API_KEY not found in parent .env file');
  process.exit(1);
}

if (!process.env.PINECONE_INDEX) {
  console.error('PINECONE_INDEX not found in parent .env file');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not found in parent .env file');
  process.exit(1);
}

testFunctions().catch(console.error);