# hit test endpoint 
echo "Testing /test endpoint..." 
curl http://localhost:8888/.netlify/functions/test \
    | jq . 

# hit search endpoint 
echo ""
echo "Testing search endpoint..."
curl -X POST http://localhost:8888/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4000" \
  -d '{"query": "portfolio or resume"}'  \
    | jq . 

# hit chat endpoint
echo ""
echo "Testing chat endpoint..."
curl -X POST http://localhost:8888/.netlify/functions/chat \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4000" \
  -d '{"query": "What is Tims background?"}'  \
    | jq .
