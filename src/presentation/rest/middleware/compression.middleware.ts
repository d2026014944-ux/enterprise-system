/**
 * Compression Middleware — Response compression
 *
 * Compresses response bodies using gzip or brotli.
 * Skips compression for small responses (<1KB) and already-compressed content.
 *
 * Configuration:
 * - Minimum response size: 1KB
 * - Supported encodings: gzip, brotli, deflate
 * - Excluded content types: images, videos, already-compressed formats
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as compression from 'compression';

@Injectable()
export class CompressionMiddleware implements NestMiddleware {
  private readonly compressionHandler: ReturnType<typeof compression>;

  constructor() {
    this.compressionHandler = compression({
      // Only compress responses larger than 1KB
      threshold: 1024,
      // Compression level (1-9, 6 is default balance of speed/compression)
      level: 6,
      // Custom filter — skip already-compressed content types
      filter: (req: Request, res: Response) => {
        // Don't compress if client doesn't accept it
        if (req.headers['x-no-compression']) {
          return false;
        }

        // Use default filter for text-based content types
        return compression.filter(req, res);
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.compressionHandler(req, res, next);
  }
}
