/**
 * Token Service — Application-layer port for JWT token operations.
 */
export interface TokenPayload {
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface TokenService {
  generateAccessToken(payload: Record<string, unknown>): string;
  generateRefreshToken(): string;
  verifyAccessToken(token: string): Promise<TokenPayload | null>;
  getAccessTokenTtl(): number;
  getRefreshTokenTtl(): number;
}

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
