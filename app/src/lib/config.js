// API configuration
// In production, PUBLIC_API_URL should be set as an environment variable in Railway
// Format: https://your-backend-url.railway.app (include the protocol!)
export const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

// Mapbox token
export const MAPBOX_TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN;

// Debug: Log what we got during build
console.log('🔍 Config loaded:', {
  API_URL,
  MAPBOX_TOKEN: MAPBOX_TOKEN ? `${MAPBOX_TOKEN.substring(0, 10)}...` : 'undefined',
  raw_PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL,
  raw_PUBLIC_MAPBOX_TOKEN: import.meta.env.PUBLIC_MAPBOX_TOKEN ? 'present' : 'missing'
});
