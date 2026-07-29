/**
 * Performance / Load Test — k6 Script
 *
 * Tests:
 * - 1000 req/s sustained load
 * - 5000 req/s burst
 * - Measures p50, p95, p99 latency
 *
 * Usage:
 *   k6 run --vus 100 --duration 60s test/performance/load-test.ts
 *   k6 run test/performance/load-test.ts
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration', true);
const userFetchDuration = new Trend('user_fetch_duration', true);

// ─── Configuration ───

export const options = {
  scenarios: {
    // Sustained load: 1000 req/s for 60s
    sustained: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      exec: 'sustainedLoad',
    },
    // Burst: 5000 req/s for 10s
    burst: {
      executor: 'constant-arrival-rate',
      rate: 5000,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      startTime: '70s',
      exec: 'burstLoad',
    },
  },
  thresholds: {
    http_req_duration: ['p(50)<50', 'p(95)<200', 'p(99)<500'],
    errors: ['rate<0.01'],
    login_duration: ['p(95)<100'],
    user_fetch_duration: ['p(95)<100'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ─── Helpers ───

function getRandomEmail(): string {
  return `loadtest-${Math.random().toString(36).slice(2)}@example.com`;
}

function registerUser(email: string): string | null {
  const payload = JSON.stringify({
    email,
    password: 'Str0ng!Pass',
    firstName: 'Load',
    lastName: 'Test',
  });

  const res = http.post(`${BASE_URL}/users/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status === 201) {
    const body = JSON.parse(res.body);
    return body.id;
  }
  return null;
}

function login(email: string): { accessToken: string; refreshToken: string } | null {
  const payload = JSON.stringify({ email, password: 'Str0ng!Pass' });

  const res = http.post(`${BASE_URL}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  loginDuration.add(res.timings.duration);

  if (res.status === 200) {
    return JSON.parse(res.body);
  }
  return null;
}

// ─── Scenarios ───

export function sustainedLoad(): void {
  const email = getRandomEmail();

  // Register
  const regRes = http.post(
    `${BASE_URL}/users/register`,
    JSON.stringify({
      email,
      password: 'Str0ng!Pass',
      firstName: 'Sustained',
      lastName: 'Load',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(regRes, {
    'register: status 201': (r) => r.status === 201 || r.status === 409,
  });

  errorRate.add(regRes.status >= 500);

  // Login
  const tokens = login(email);
  if (tokens) {
    // Fetch profile
    const userRes = http.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    userFetchDuration.add(userRes.timings.duration);

    check(userRes, {
      'fetch user: status 200': (r) => r.status === 200,
    });

    errorRate.add(userRes.status >= 500);
  }

  sleep(0.1);
}

export function burstLoad(): void {
  const email = getRandomEmail();

  // Quick register + login
  const tokens = login(email);

  if (!tokens) {
    // Try registering first
    registerUser(email);
    const newTokens = login(email);
    if (newTokens) {
      const res = http.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${newTokens.accessToken}` },
      });
      check(res, { 'burst: status 200': (r) => r.status === 200 });
      errorRate.add(res.status >= 500);
    }
  } else {
    const res = http.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    check(res, { 'burst: status 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  }

  sleep(0.01);
}

// ─── Setup ───

export function setup(): void {
  // Warm up
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Application not ready: ${res.status}`);
  }
}

// ─── Teardown ───

export function teardown(): void {
  console.log('Load test completed.');
}
