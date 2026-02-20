import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestSizeLimiterMiddleware implements NestMiddleware {
  private readonly maxRequestSize: number;
  private readonly maxUrlLength: number;
  private readonly maxHeadersCount: number;

  constructor() {
    // Get values from config or use defaults
    this.maxRequestSize = parseInt(process.env.MAX_REQUEST_SIZE || '10485760', 10); // 10MB default
    this.maxUrlLength = parseInt(process.env.MAX_URL_LENGTH || '2048', 10); // 2KB default
    this.maxHeadersCount = parseInt(process.env.MAX_HEADERS_COUNT || '50', 10); // 50 headers default
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Check URL length
    if (req.url.length > this.maxUrlLength) {
      throw new BadRequestException(`Request URL exceeds maximum allowed length of ${this.maxUrlLength} characters`);
    }

    // Check number of headers
    const headerCount = Object.keys(req.headers).length;
    if (headerCount > this.maxHeadersCount) {
      throw new BadRequestException(`Request exceeds maximum allowed headers count of ${this.maxHeadersCount}`);
    }

    // Check content length header if present
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > this.maxRequestSize) {
        throw new BadRequestException(`Request body exceeds maximum allowed size of ${this.maxRequestSize} bytes`);
      }
    }

    // For chunked requests or when content-length is not available, monitor stream size
    let receivedSize = 0;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.on('data', (chunk: Buffer) => {
        receivedSize += chunk.length;
        if (receivedSize > this.maxRequestSize) {
          req.destroy();
          throw new BadRequestException(`Request body exceeds maximum allowed size of ${this.maxRequestSize} bytes`);
        }
      });
    }

    next();
  }
}
