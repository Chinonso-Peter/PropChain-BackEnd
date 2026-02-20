import { SecurityMiddleware } from '../../src/security/middleware/security.middleware';
import { Request } from 'express';

describe('SecurityMiddleware', () => {
  let middleware: SecurityMiddleware;

  // Mock services
  const mockIpBlockingService = {
    shouldBlockRequest: jest.fn(),
  };

  const mockDdosProtectionService = {
    monitorTraffic: jest.fn(),
    isIpBlockedForDdos: jest.fn(),
  };

  const mockSecurityHeadersService = {
    getSecurityHeaders: jest.fn().mockReturnValue({}),
  };

  beforeEach(() => {
    middleware = new SecurityMiddleware(
      mockIpBlockingService as any,
      mockDdosProtectionService as any,
      mockSecurityHeadersService as any,
    );
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
        connection: {},
        socket: {},
      } as unknown as Request;

      // @ts-ignore - accessing private method for testing
      const ip = middleware['getClientIp'](req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const req = {
        headers: {
          'x-real-ip': '192.168.1.2',
        },
        connection: {},
        socket: {},
      } as unknown as Request;

      // @ts-ignore - accessing private method for testing
      const ip = middleware['getClientIp'](req);
      expect(ip).toBe('192.168.1.2');
    });

    it('should use connection.remoteAddress when headers are not present', () => {
      const req = {
        headers: {},
        connection: {
          remoteAddress: '192.168.1.3',
        },
        socket: {},
      } as unknown as Request;

      // @ts-ignore - accessing private method for testing
      const ip = middleware['getClientIp'](req);
      expect(ip).toBe('192.168.1.3');
    });

    it('should use socket.remoteAddress as fallback', () => {
      const req = {
        headers: {},
        connection: {},
        socket: {
          remoteAddress: '192.168.1.4',
        },
      } as unknown as Request;

      // @ts-ignore - accessing private method for testing
      const ip = middleware['getClientIp'](req);
      expect(ip).toBe('192.168.1.4');
    });

    it('should return unknown when no IP can be determined', () => {
      const req = {
        headers: {},
        connection: {},
        socket: {},
      } as unknown as Request;

      // @ts-ignore - accessing private method for testing
      const ip = middleware['getClientIp'](req);
      expect(ip).toBe('unknown');
    });
  });
});
