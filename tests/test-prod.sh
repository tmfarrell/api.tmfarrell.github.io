# hit test endpoint 
echo "Testing /test endpoint..." 
curl https://api-tmfarrell.netlify.app/.netlify/functions/test \
    | jq . 

# hit search endpoint 
echo ""
echo "Testing search endpoint.."
curl -X POST https://api-tmfarrell.netlify.app/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AI"}'  \
    | jq . 