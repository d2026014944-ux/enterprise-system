/**
 * Cache Module
 *
 * Provides Redis-based caching infrastructure.
 * Exports CacheService for use across the application.
 */
import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
