// API configuration
// Check if we're in production by looking at the hostname
const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('railway.app');

export const API_URL = isProduction
  ? 'https://tracker-2-production.up.railway.app'
  : (import.meta.env.PUBLIC_API_URL || 'http://localhost:3001');

export const MAPBOX_TOKEN = isProduction
  ? 'pk.eyJ1IjoicGhpbGx5YmlrZXRyYWluIiwiYSI6ImNtaTl6dm54ZjB0eXIydG9hdHFjOHd1Y3MifQ._R6oFOXRKRLmNtmu9Qe2Jg'
  : import.meta.env.PUBLIC_MAPBOX_TOKEN;

console.log('🔍 Config:', { API_URL, hasToken: !!MAPBOX_TOKEN, isProduction });
