# hit test endpoint 
echo "Testing /test endpoint..." 
curl http://localhost:8888/.netlify/functions/test \
    | jq . 

# hit search endpoint 
echo ""
echo "Testing search endpoint.."
curl -X POST http://localhost:8888/.netlify/functions/search \
  -H "Content-Type: application/json" \
  -d '{"query": "resume"}'  \
    | jq . 