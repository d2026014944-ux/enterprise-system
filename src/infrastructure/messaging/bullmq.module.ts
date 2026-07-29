/**
 * BullMQ Module
 *
 * Registers event publisher and processor services.
 * Provides the EventPublisher port implementation.
 */
import { Module, Global } from '@nestjs/common';
import { EventPublisherImpl } from './event-publisher.impl';
import { EventProcessorService } from './event-processor.service';

/**
 * Injection token for the EventPublisher port.
 * Application layer uses @Inject(EVENT_PUBLISHER) to receive the implementation.
 */
export const EVENT_PUBLISHER = Symbol('EventPublisher');

@Global()
@Module({
  providers: [
    EventPublisherImpl,
    EventProcessorService,
    {
      provide: EVENT_PUBLISHER,
      useExisting: EventPublisherImpl,
    },
  ],
  exports: [EVENT_PUBLISHER, EventPublisherImpl, EventProcessorService],
})
export class BullMQModule {}
