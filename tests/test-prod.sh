# hit test endpoint 
echo "Testing /test endpoint..." 
curl https://api-tmfarrell.netlify.app/.netlify/functions/test \
    | jq . 

# hit search endpoint 
echo ""
echo "Testing search endpoint..."
curl -X POST https://api-tmfarrell.netlify.app/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -H "Origin: https://tmfarrell.github.io" \
  -d '{"query": "AI"}'  \
    | jq . 

# hit chat endpoint
echo ""
echo "Testing chat endpoint..."
curl -X POST https://api-tmfarrell.netlify.app/.netlify/functions/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://tmfarrell.github.io" \
  -d '{"query": "What is Tims background?"}'  \
    | jq .