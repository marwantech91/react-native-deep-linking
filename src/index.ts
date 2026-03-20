import { Linking, Platform } from 'react-native';
import { useEffect, useState, useCallback, useRef } from 'react';

interface RouteParams {
  [key: string]: string;
}

type RouteHandler = (
  params: RouteParams,
  url: URL,
  context?: Record<string, unknown>
) => void | Promise<void>;

interface Route {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

interface DeepLinkRouterOptions {
  schemes?: string[];
  hosts?: string[];
  validate?: (url: URL) => boolean;
  onNoMatch?: (url: URL) => void;
  onError?: (error: Error) => void;
}

export class DeepLinkRouter {
  private routes: Route[] = [];
  private schemes: string[];
  private hosts: string[];
  private validate?: (url: URL) => boolean;
  private onNoMatch?: (url: URL) => void;
  private onError?: (error: Error) => void;
  private listenerRemover: (() => void) | null = null;

  constructor(options: DeepLinkRouterOptions = {}) {
    this.schemes = options.schemes || ['https', 'http'];
    this.hosts = options.hosts || [];
    this.validate = options.validate;
    this.onNoMatch = options.onNoMatch;
    this.onError = options.onError;
  }

  register(pattern: string, handler: RouteHandler): void {
    const { regex, paramNames } = this.compilePattern(pattern);
    this.routes.push({ pattern, regex, paramNames, handler });
  }

  unregister(pattern: string): void {
    this.routes = this.routes.filter(route => route.pattern !== pattern);
  }

  async handle(urlString: string, context?: Record<string, unknown>): Promise<boolean> {
    try {
      const url = this.parseUrl(urlString);
      if (!url) return false;

      // Validate URL
      if (!this.isValidUrl(url)) {
        return false;
      }

      // Custom validation
      if (this.validate && !this.validate(url)) {
        return false;
      }

      // Find matching route
      const pathname = url.pathname || '/';

      for (const route of this.routes) {
        const match = pathname.match(route.regex);
        if (match) {
          const params: RouteParams = {};
          route.paramNames.forEach((name, index) => {
            params[name] = match[index + 1] || '';
          });

          await route.handler(params, url, context);
          return true;
        }
      }

      // No match found
      this.onNoMatch?.(url);
      return false;
    } catch (error) {
      this.onError?.(error as Error);
      return false;
    }
  }

  startListening(): void {
    // Handle initial URL
    Linking.getInitialURL().then(url => {
      if (url) this.handle(url);
    });

    // Listen for new URLs
    const subscription = Linking.addEventListener('url', ({ url }) => {
      this.handle(url);
    });

    this.listenerRemover = () => subscription.remove();
  }

  stopListening(): void {
    this.listenerRemover?.();
    this.listenerRemover = null;
  }

  getRegisteredPatterns(): string[] {
    return this.routes.map(route => route.pattern);
  }

  hasRoute(pattern: string): boolean {
    return this.routes.some(route => route.pattern === pattern);
  }

  get routeCount(): number {
    return this.routes.length;
  }

  private parseUrl(urlString: string): URL | null {
    try {
      // Handle custom schemes
      let normalizedUrl = urlString;
      for (const scheme of this.schemes) {
        if (urlString.startsWith(`${scheme}://`) && scheme !== 'https' && scheme !== 'http') {
          // Convert custom scheme to https for URL parsing
          normalizedUrl = urlString.replace(`${scheme}://`, 'https://');
          break;
        }
      }

      return new URL(normalizedUrl);
    } catch {
      return null;
    }
  }

  private isValidUrl(url: URL): boolean {
    // Check host if hosts are specified
    if (this.hosts.length > 0) {
      const host = url.hostname.replace('www.', '');
      if (!this.hosts.some(h => h.replace('www.', '') === host)) {
        return false;
      }
    }
    return true;
  }

  private compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    let regexStr = pattern
      // Escape special regex chars (except : and *)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Handle optional params :param?
      .replace(/:(\w+)\?/g, (_, name) => {
        paramNames.push(name);
        return '([^/]*)';
      })
      // Handle required params :param
      .replace(/:(\w+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      // Handle wildcard *
      .replace(/\*/g, '.*');

    // Anchor the pattern
    regexStr = `^${regexStr}$`;

    return {
      regex: new RegExp(regexStr),
      paramNames,
    };
  }
}

// Deferred Deep Links
interface DeferredDeepLinkOptions {
  checkAttribution?: () => Promise<string | null>;
  storageKey?: string;
}

export class DeferredDeepLink {
  private checkAttribution?: () => Promise<string | null>;
  private storageKey: string;
  private storage: any;

  constructor(options: DeferredDeepLinkOptions = {}) {
    this.checkAttribution = options.checkAttribution;
    this.storageKey = options.storageKey || '@deferred_deep_link_checked';
  }

  async check(): Promise<string | null> {
    try {
      // Check if already processed
      const checked = await this.storage?.getItem(this.storageKey);
      if (checked) return null;

      // Mark as checked
      await this.storage?.setItem(this.storageKey, 'true');

      // Check attribution service
      if (this.checkAttribution) {
        return await this.checkAttribution();
      }

      return null;
    } catch {
      return null;
    }
  }
}

// React Hooks
interface UseDeepLinkResult {
  initialUrl: string | null;
  latestUrl: string | null;
}

export function useDeepLink(): UseDeepLinkResult {
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);

  useEffect(() => {
    // Get initial URL
    Linking.getInitialURL().then(url => {
      setInitialUrl(url);
      if (url) setLatestUrl(url);
    });

    // Listen for new URLs
    const subscription = Linking.addEventListener('url', ({ url }) => {
      setLatestUrl(url);
    });

    return () => subscription.remove();
  }, []);

  return { initialUrl, latestUrl };
}

export function useDeepLinkHandler(
  pattern: string,
  handler: RouteHandler,
  deps: unknown[] = []
): void {
  const routerRef = useRef<DeepLinkRouter>();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const router = new DeepLinkRouter();
    router.register(pattern, (params, url, context) => {
      handlerRef.current(params, url, context);
    });
    router.startListening();
    routerRef.current = router;

    return () => {
      router.stopListening();
    };
  }, [pattern, ...deps]);
}

// Utility functions
export function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string | number>
): string {
  let url = `${base}${path}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

export function extractPathSegments(url: string): string[] {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

export function parseQueryParams(url: string): Record<string, string> {
  try {
    const parsed = new URL(url);
    const params: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return {};
  }
}

export default DeepLinkRouter;
export type { RouteParams, RouteHandler, DeepLinkRouterOptions };
