#!/usr/bin/env node

// Local test script for the standalone search functions
// Run with: node test-local.js

// Load environment variables from parent directory
require('dotenv').config({ path: '.env' });

const { handler: searchHandler } = require('../functions/search.js');
const { handler: testHandler } = require('../functions/test.js');

async function testFunctions() {
  console.log('🔍 Testing Standalone Search Functions\n');
  console.log('Environment check:');
  console.log('- API Key set:', !!process.env.PINECONE_API_KEY);
  console.log('- Index set:', !!process.env.PINECONE_INDEX);
  console.log('');

  // Test 1: Test endpoint
  console.log('Test 1: Test endpoint');
  try {
    const testResult = await testHandler({ httpMethod: 'GET' }, {});
    console.log('Status:', testResult.statusCode);
    
    if (testResult.statusCode === 200) {
      const data = JSON.parse(testResult.body);
      console.log('✅ Test endpoint working');
      console.log('  - Has API Key:', data.environment.hasApiKey);
      console.log('  - Has Index:', data.environment.hasIndex);
      console.log('  - Index Name:', data.environment.indexName);
    }
  } catch (error) {
    console.error('❌ Test endpoint failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Search with valid query
  console.log('Test 2: Search with valid query');
  const searchEvent = {
    httpMethod: 'POST',
    body: JSON.stringify({ query: 'data science' })
  };

  try {
    const searchResult = await searchHandler(searchEvent, {});
    console.log('Status:', searchResult.statusCode);
    
    if (searchResult.statusCode === 200) {
      const data = JSON.parse(searchResult.body);
      console.log('✅ Search successful');
      console.log(`  - Found ${data.results?.length || 0} results`);
      if (data.results && data.results.length > 0) {
        console.log(`  - First result: ${data.results[0].title}`);
        console.log(`  - Score: ${Math.round(data.results[0].score * 100)}%`);
      }
    } else {
      const error = JSON.parse(searchResult.body);
      console.log('❌ Search failed:', error.message);
    }
  } catch (error) {
    console.error('❌ Search error:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 3: CORS preflight
  console.log('Test 3: CORS preflight request');
  const corsEvent = { httpMethod: 'OPTIONS' };

  try {
    const corsResult = await searchHandler(corsEvent, {});
    console.log('Status:', corsResult.statusCode);
    console.log('✅ CORS headers:', !!corsResult.headers['Access-Control-Allow-Origin']);
  } catch (error) {
    console.error('❌ CORS test failed:', error.message);
  }

  console.log('\n✅ Local testing complete!');
  console.log('\nNext steps:');
  console.log('1. Deploy this directory to Netlify');
  console.log('2. Set environment variables in Netlify dashboard');
  console.log('3. Test the live endpoints');
}

// Check environment
if (!process.env.PINECONE_API_KEY) {
  console.error('❌ PINECONE_API_KEY not found in parent .env file');
  process.exit(1);
}

if (!process.env.PINECONE_INDEX) {
  console.error('❌ PINECONE_INDEX not found in parent .env file');
  process.exit(1);
}

testFunctions().catch(console.error);