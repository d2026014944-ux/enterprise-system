/**
 * Auth E2E Tests
 *
 * Tests: token refresh, token revocation, concurrent refresh (race condition).
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/test-app.helper';

describe('Auth E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register a test user
    await request(app.getHttpServer())
      .post('/users/register')
      .send({
        email: 'auth-e2e@example.com',
        password: 'Str0ng!Pass',
        firstName: 'Auth',
        lastName: 'E2E',
      });

    // Login
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auth-e2e@example.com', password: 'Str0ng!Pass' });

    accessToken = loginResponse.body.accessToken;
    refreshToken = loginResponse.body.refreshToken;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  // ─── Token Refresh ───

  describe('POST /auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.accessToken).not.toBe(accessToken);

      // Update tokens for subsequent tests
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should reject expired refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'expired-token' })
        .expect(401);
    });

    it('should reject revoked refresh token', async () => {
      // First revoke
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Then try to use revoked token
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      // Re-login for remaining tests
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'auth-e2e@example.com', password: 'Str0ng!Pass' });

      accessToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;
    });
  });

  // ─── Token Revocation ───

  describe('POST /auth/logout', () => {
    it('should revoke refresh token on logout', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Re-login
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'auth-e2e@example.com', password: 'Str0ng!Pass' });

      accessToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;
    });
  });

  // ─── Concurrent Refresh (Race Condition) ───

  describe('concurrent refresh', () => {
    it('should handle concurrent refresh requests (only one succeeds)', async () => {
      // Fire two refresh requests concurrently with the same token
      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken }),
        request(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken }),
      ]);

      const statuses = results.map((r) =>
        r.status === 'fulfilled' ? r.value.status : 500,
      );

      // Exactly one should succeed (200), one should fail (401)
      const succeeded = statuses.filter((s) => s === 200).length;
      const failed = statuses.filter((s) => s === 401).length;

      expect(succeeded).toBe(1);
      expect(failed).toBe(1);
    });
  });

  // ─── Authorization ───

  describe('authorization', () => {
    it('should reject request without Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .expect(401);
    });

    it('should reject malformed Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'NotBearer token')
        .expect(401);
    });

    it('should reject invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });
});
