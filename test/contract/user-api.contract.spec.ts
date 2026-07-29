/**
 * User API Contract Tests
 *
 * Validates that API responses match the expected OpenAPI schema.
 * Tests all error response formats.
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/test-app.helper';

describe('User API Contract', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Register and login
    const regResponse = await request(app.getHttpServer())
      .post('/users/register')
      .send({
        email: 'contract@example.com',
        password: 'Str0ng!Pass',
        firstName: 'Contract',
        lastName: 'Test',
      });

    userId = regResponse.body.id;

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'contract@example.com', password: 'Str0ng!Pass' });

    accessToken = loginResponse.body.accessToken;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  // ─── User Response Schema ───

  describe('GET /users/:id response schema', () => {
    it('should match user response contract', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Required fields
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('firstName');
      expect(response.body).toHaveProperty('lastName');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('emailVerified');
      expect(response.body).toHaveProperty('createdAt');

      // Types
      expect(typeof response.body.id).toBe('string');
      expect(typeof response.body.email).toBe('string');
      expect(typeof response.body.firstName).toBe('string');
      expect(typeof response.body.lastName).toBe('string');
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.emailVerified).toBe('boolean');
      expect(typeof response.body.createdAt).toBe('string');

      // Must NOT expose sensitive fields
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('version');
    });
  });

  // ─── Registration Response Schema ───

  describe('POST /users/register response schema', () => {
    it('should match registration response contract', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'contract-new@example.com',
          password: 'Str0ng!Pass',
          firstName: 'New',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  // ─── Error Response Formats ───

  describe('error response formats', () => {
    it('should return 400 with validation errors', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({ email: 'bad', password: 'weak', firstName: '', lastName: '' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message) || typeof response.body.message === 'string').toBe(true);
    });

    it('should return 401 with auth error', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .expect(401);

      expect(response.body).toHaveProperty('statusCode', 401);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should return 409 for duplicate registration', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'contract@example.com',
          password: 'Str0ng!Pass',
          firstName: 'Dup',
          lastName: 'User',
        })
        .expect(409);

      expect(response.body).toHaveProperty('statusCode', 409);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 429 on rate limit', async () => {
      // Fire many requests to trigger rate limit
      const requests = Array.from({ length: 50 }, () =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'contract@example.com', password: 'Wrong!Pass1' }),
      );

      const results = await Promise.all(requests);
      const rateLimited = results.filter((r) => r.status === 429);

      // At least some should be rate limited
      expect(rateLimited.length).toBeGreaterThan(0);

      if (rateLimited.length > 0) {
        expect(rateLimited[0].body).toHaveProperty('statusCode', 429);
      }
    });
  });

  // ─── Content-Type ───

  describe('content type', () => {
    it('should return JSON content type', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });
});
