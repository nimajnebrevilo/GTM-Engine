/**
 * Vitest global setup — loads .env before any test runs.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname, '../../.env') });
