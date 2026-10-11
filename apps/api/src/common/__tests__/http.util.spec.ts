import type { Request } from 'express';
import { clientInfo, clientIp, deviceNameFromUserAgent } from '../utils/http.util';

const makeRequest = (headers: Record<string, string | string[]>, ip = '10.0.0.5'): Request =>
  ({ headers, ip, socket: { remoteAddress: ip } }) as unknown as Request;

describe('client info', () => {
  it('uses the address Express resolved across trusted proxies, never the raw header', () => {
    // «5.5.5.5» is what a visitor can write into the header himself
    expect(clientIp(makeRequest({ 'x-forwarded-for': '5.5.5.5, 10.0.0.1' }, '10.0.0.1'))).toBe('10.0.0.1');
  });

  it('treats an IPv4-mapped address as the plain IPv4 one', () => {
    expect(clientIp(makeRequest({}, '::ffff:2.144.10.20'))).toBe('2.144.10.20');
  });

  it('falls back to the socket address', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.5' } } as unknown as Request)).toBe(
      '10.0.0.5',
    );
  });

  it('summarises the user agent for the devices list', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1')).toBe(
      'Safari • iPhone',
    );
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0')).toBe('Chrome • Windows');
    expect(deviceNameFromUserAgent(null)).toBeNull();
  });

  it('builds the full client info object', () => {
    const info = clientInfo(makeRequest({ 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/126' }));
    expect(info).toEqual({ ip: '10.0.0.5', userAgent: expect.any(String), deviceName: 'Chrome • macOS' });
  });
});
