// Initialize Vercel Web Analytics
// This file loads and initializes the Vercel Analytics SDK
import { inject } from './analytics.mjs';

// Inject Vercel Web Analytics
inject({
  mode: 'auto',
  debug: false
});
