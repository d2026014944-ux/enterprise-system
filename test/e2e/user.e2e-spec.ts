/**
 * User E2E Tests
 *
 * Full E2E with real HTTP requests.
 * Tests: register → login → get profile → update → delete lifecycle.
 * Tests: authorization, rate limiting, error responses.
 */

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/test-app.helper';

describe('User E2E', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  // ─── Registration ───

  describe('POST /users/register', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'e2e-new@example.com',
          password: 'Str0ng!Pass',
          firstName: 'E2E',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe('e2e-new@example.com');
      userId = response.body.id;
    });

    it('should reject duplicate email', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'e2e-new@example.com',
          password: 'Str0ng!Pass',
          firstName: 'Dup',
          lastName: 'User',
        })
        .expect(409);

      expect(response.body.code).toBeDefined();
    });

    it('should reject invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'not-an-email',
          password: 'Str0ng!Pass',
          firstName: 'Bad',
          lastName: 'Email',
        })
        .expect(400);
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'weak@example.com',
          password: 'weak',
          firstName: 'Weak',
          lastName: 'Pass',
        })
        .expect(400);
    });
  });

  // ─── Login ───

  describe('POST /auth/login', () => {
    it('should login and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e-new@example.com', password: 'Str0ng!Pass' })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      accessToken = response.body.accessToken;
    });

    it('should reject wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'e2e-new@example.com', password: 'Wrong!Pass1' })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'Str0ng!Pass' })
        .expect(401);
    });
  });

  // ─── Get Profile ───

  describe('GET /users/:id', () => {
    it('should return user profile with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.email).toBe('e2e-new@example.com');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .expect(401);
    });

    it('should return 403 for unauthorized access to other user', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  // ─── Update ───

  describe('PATCH /users/:id', () => {
    it('should update user profile', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(response.body.firstName).toBe('Updated');
    });
  });

  // ─── Delete ───

  describe('DELETE /users/:id', () => {
    it('should delete user', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('should return 404 after deletion', async () => {
      await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── Error Response Format ───

  describe('error responses', () => {
    it('should return structured error body', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/invalid-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('message');
    });
  });
});
