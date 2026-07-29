/**
 * Logger Module — Global structured logging
 *
 * Provides LoggerService globally. Configure log level via LOG_LEVEL env var.
 */

import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
