import { describe, expect, it } from 'vitest';

import { checkRateLimit, extractClientIp, readCookie } from './playground-auth';

describe('playground auth helpers', () => {
  it('extracts the first forwarded IP address', () => {
    const request = new Request('http://localhost/api/auth/me', {
      headers: {
        'x-forwarded-for': '203.0.113.7, 198.51.100.4',
        'x-real-ip': '198.51.100.9'
      }
    });

    expect(extractClientIp(request)).toBe('203.0.113.7');
  });

  it('reads URL-encoded cookies by name', () => {
    const request = new Request('http://localhost/api/auth/me', {
      headers: {
        cookie: 'theme=dark; sid=token%3Dabc%3D; other=value'
      }
    });

    expect(readCookie(request, 'sid')).toBe('token=abc=');
    expect(readCookie(request, 'missing')).toBeUndefined();
  });

  it('enforces a fixed-window rate limit', () => {
    expect(checkRateLimit({ key: 'test-window', max: 2, windowMs: 1000, nowMs: 100 })).toBe(true);
    expect(checkRateLimit({ key: 'test-window', max: 2, windowMs: 1000, nowMs: 200 })).toBe(true);
    expect(checkRateLimit({ key: 'test-window', max: 2, windowMs: 1000, nowMs: 300 })).toBe(false);
    expect(checkRateLimit({ key: 'test-window', max: 2, windowMs: 1000, nowMs: 1200 })).toBe(true);
  });
});
