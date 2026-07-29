/**
 * Auth Module
 *
 * Registers JWT strategy, auth guard, and auth service.
 * Exports AuthService for use by other modules.
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: configService.get<string>('JWT_ISSUER', 'enterprise-system'),
          audience: configService.get<string>('JWT_AUDIENCE', 'enterprise-api'),
        },
      }),
    }),
  ],
  providers: [JwtStrategy, AuthService, JwtAuthGuard, PrismaService],
  exports: [AuthService, JwtAuthGuard, JwtModule, PassportModule],
})
export class AuthModule {}
