/**
 * Exa API client.
 * Semantic/similarity search for company discovery and trigger detection.
 * Docs: https://docs.exa.ai
 */

import Exa from 'exa-js';
import { getEnv } from '../../config/env.js';

let _client: Exa | null = null;

export function getExaClient(): Exa {
  if (_client) return _client;

  const env = getEnv();
  if (!env.EXA_API_KEY) {
    throw new Error('EXA_API_KEY not configured');
  }

  _client = new Exa(env.EXA_API_KEY);
  return _client;
}
