/**
 * Supabase Module
 *
 * Provides Supabase client as a global module.
 * Import this module to access Supabase from any service.
 */

import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
