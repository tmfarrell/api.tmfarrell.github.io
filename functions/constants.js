const ALLOWED_ORIGINS = [
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'https://tmfarrell.github.io', 
  'http://tmfarrell.github.io'
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

module.exports = { ALLOWED_ORIGINS, isAllowedOrigin };
