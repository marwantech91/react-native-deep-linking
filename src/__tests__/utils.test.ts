/**
 * Tests for deep linking utility functions.
 * These are pure functions that don't depend on React Native.
 */

// Mock react-native before importing the module
jest.mock('react-native', () => ({
  Linking: {
    getInitialURL: jest.fn().mockResolvedValue(null),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
  Platform: { OS: 'ios' },
}));

jest.mock('react', () => ({
  useEffect: jest.fn(),
  useState: jest.fn().mockReturnValue([null, jest.fn()]),
  useCallback: jest.fn((fn: any) => fn),
  useRef: jest.fn().mockReturnValue({ current: null }),
}));

import {
  buildUrl,
  extractPathSegments,
  matchesScheme,
  getSchemeFromUrl,
  parseQueryParams,
  DeepLinkRouter,
} from '../index';

// === buildUrl ===

describe('buildUrl', () => {
  it('builds a URL with path', () => {
    expect(buildUrl('https://example.com', '/users')).toBe('https://example.com/users');
  });

  it('appends query params', () => {
    const url = buildUrl('https://api.io', '/search', { q: 'hello', page: 1 });
    expect(url).toContain('q=hello');
    expect(url).toContain('page=1');
  });

  it('omits query string when no params', () => {
    const url = buildUrl('https://example.com', '/path');
    expect(url).toBe('https://example.com/path');
  });
});

// === extractPathSegments ===

describe('extractPathSegments', () => {
  it('extracts segments from URL', () => {
    expect(extractPathSegments('https://example.com/a/b/c')).toEqual(['a', 'b', 'c']);
  });

  it('filters empty segments', () => {
    expect(extractPathSegments('https://example.com/a//b/')).toEqual(['a', 'b']);
  });

  it('returns empty array for invalid URL', () => {
    expect(extractPathSegments('not a url')).toEqual([]);
  });

  it('returns empty array for root path', () => {
    expect(extractPathSegments('https://example.com/')).toEqual([]);
  });
});

// === matchesScheme ===

describe('matchesScheme', () => {
  it('matches https scheme', () => {
    expect(matchesScheme('https://example.com', 'https')).toBe(true);
  });

  it('matches custom scheme', () => {
    expect(matchesScheme('myapp://deep/link', 'myapp')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesScheme('MYAPP://test', 'myapp')).toBe(true);
  });

  it('returns false for non-matching scheme', () => {
    expect(matchesScheme('https://example.com', 'http')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(matchesScheme('', 'https')).toBe(false);
  });
});

// === getSchemeFromUrl ===

describe('getSchemeFromUrl', () => {
  it('extracts https scheme', () => {
    expect(getSchemeFromUrl('https://example.com')).toBe('https');
  });

  it('extracts custom scheme', () => {
    expect(getSchemeFromUrl('myapp://deep/link')).toBe('myapp');
  });

  it('normalizes to lowercase', () => {
    expect(getSchemeFromUrl('HTTPS://EXAMPLE.COM')).toBe('https');
  });

  it('returns null for invalid URL', () => {
    expect(getSchemeFromUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getSchemeFromUrl('')).toBeNull();
  });
});

// === parseQueryParams ===

describe('parseQueryParams', () => {
  it('parses query parameters', () => {
    const params = parseQueryParams('https://example.com?foo=bar&baz=qux');
    expect(params).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('returns empty object for no params', () => {
    expect(parseQueryParams('https://example.com')).toEqual({});
  });

  it('returns empty object for invalid URL', () => {
    expect(parseQueryParams('invalid')).toEqual({});
  });
});

// === DeepLinkRouter ===

describe('DeepLinkRouter', () => {
  let router: DeepLinkRouter;

  beforeEach(() => {
    router = new DeepLinkRouter({ schemes: ['https', 'myapp'], hosts: ['example.com'] });
  });

  it('registers and lists patterns', () => {
    router.register('/users/:id', jest.fn());
    router.register('/products/:slug', jest.fn());
    expect(router.getRegisteredPatterns()).toEqual(['/users/:id', '/products/:slug']);
  });

  it('hasRoute returns true for registered pattern', () => {
    router.register('/test', jest.fn());
    expect(router.hasRoute('/test')).toBe(true);
  });

  it('hasRoute returns false for unregistered pattern', () => {
    expect(router.hasRoute('/unknown')).toBe(false);
  });

  it('routeCount reflects registered routes', () => {
    expect(router.routeCount).toBe(0);
    router.register('/a', jest.fn());
    router.register('/b', jest.fn());
    expect(router.routeCount).toBe(2);
  });

  it('unregister removes a route', () => {
    router.register('/temp', jest.fn());
    expect(router.routeCount).toBe(1);
    router.unregister('/temp');
    expect(router.routeCount).toBe(0);
  });

  it('handles matching URL', async () => {
    const handler = jest.fn();
    router.register('/users/:id', handler);
    const matched = await router.handle('https://example.com/users/42');
    expect(matched).toBe(true);
    expect(handler).toHaveBeenCalledWith(
      { id: '42' },
      expect.any(URL),
      undefined
    );
  });

  it('returns false for non-matching URL', async () => {
    router.register('/users/:id', jest.fn());
    const matched = await router.handle('https://example.com/posts/1');
    expect(matched).toBe(false);
  });

  it('rejects invalid host', async () => {
    router.register('/test', jest.fn());
    const matched = await router.handle('https://evil.com/test');
    expect(matched).toBe(false);
  });

  it('calls onNoMatch for unmatched URLs', async () => {
    const onNoMatch = jest.fn();
    const r = new DeepLinkRouter({ hosts: ['example.com'], onNoMatch });
    r.register('/known', jest.fn());
    await r.handle('https://example.com/unknown');
    expect(onNoMatch).toHaveBeenCalled();
  });

  it('passes context to handler', async () => {
    const handler = jest.fn();
    router.register('/ctx', handler);
    await router.handle('https://example.com/ctx', { auth: true });
    expect(handler).toHaveBeenCalledWith({}, expect.any(URL), { auth: true });
  });
});
