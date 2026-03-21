/**
 * Global proxy support for native fetch().
 *
 * If HTTPS_PROXY or HTTP_PROXY is set, configures undici's ProxyAgent
 * as the global fetch dispatcher. All native fetch() calls (in provider
 * clients, resilience module, etc.) will automatically route through the proxy.
 *
 * Call setupProxy() once at startup — no changes needed to provider code.
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';

let _configured = false;

export function setupProxy(): void {
  if (_configured) return;
  _configured = true;

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;

  if (!proxyUrl) return;

  const agent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(agent);
}
