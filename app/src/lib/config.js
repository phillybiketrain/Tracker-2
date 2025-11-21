// API configuration
// In production, PUBLIC_API_URL should be set as an environment variable in Railway
// Format: https://your-backend-url.railway.app (include the protocol!)
export const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

// Mapbox token
export const MAPBOX_TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN;
