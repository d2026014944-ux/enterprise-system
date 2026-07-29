/**
 * Supabase Client — Server-side integration
 *
 * Provides a typed Supabase client for server-side operations.
 * Uses the service_role key for admin operations (bypasses RLS).
 * Uses the anon key for user-scoped operations (respects RLS).
 *
 * Security: Never expose service_role key to the client.
 */

import { createClient, SupabaseClient } from '@supabase/server';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupabaseService.name);

  /** Admin client (service_role) — bypasses RLS, server-side only */
  private adminClient: SupabaseClient;

  /** Public client (anon) — respects RLS, safe for user-scoped operations */
  private publicClient: SupabaseClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseKey = this.configService.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
    const serviceRoleKey = this.configService.getOrThrow<string>('SUPABASE_SECRET_KEY');

    // Admin client — service_role key (server-side only, bypasses RLS)
    this.adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Public client — anon key (respects RLS)
    this.publicClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log('Supabase clients initialized');
  }

  onModuleDestroy(): void {
    // Cleanup if needed
    this.logger.log('Supabase clients destroyed');
  }

  /**
   * Get the admin client (service_role — bypasses RLS).
   * ⚠️ Use only for server-side operations that need elevated access.
   */
  getAdminClient(): SupabaseClient {
    return this.adminClient;
  }

  /**
   * Get the public client (anon — respects RLS).
   * Use for user-scoped operations.
   */
  getPublicClient(): SupabaseClient {
    return this.publicClient;
  }

  /**
   * Get a user-scoped client (respects RLS with user's JWT).
   * Pass the user's access token to scope operations to their data.
   */
  getUserClient(accessToken: string): SupabaseClient {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseKey = this.configService.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');

    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  /**
   * Verify a JWT token and get the user.
   * Uses the JWKS endpoint for token verification.
   */
  async verifyToken(accessToken: string): Promise<{ userId: string; email: string } | null> {
    try {
      const { data: { user }, error } = await this.adminClient.auth.getUser(accessToken);

      if (error || !user) {
        return null;
      }

      return {
        userId: user.id,
        email: user.email ?? '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Health check — verify Supabase connectivity.
   */
  async healthCheck(): Promise<{ status: string; latency: number }> {
    const start = Date.now();
    try {
      // Simple query to verify connectivity
      const { error } = await this.adminClient
        .from('organizations')
        .select('id')
        .limit(1);

      return {
        status: error ? 'degraded' : 'healthy',
        latency: Date.now() - start,
      };
    } catch {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
      };
    }
  }
}
