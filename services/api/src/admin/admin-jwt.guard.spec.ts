import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { AdminJwtGuard } from './admin-jwt.guard';

const makeContext = (authHeader?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminJwtGuard', () => {
  let guard: AdminJwtGuard;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test_secret' });
    guard = new AdminJwtGuard(jwtService);
  });

  it('lança UnauthorizedException quando não há header Authorization', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
  });

  it('lança UnauthorizedException quando header não começa com "Bearer "', () => {
    expect(() => guard.canActivate(makeContext('Token abc123'))).toThrow(UnauthorizedException);
  });

  it('lança UnauthorizedException quando token é inválido', () => {
    expect(() => guard.canActivate(makeContext('Bearer token_invalido'))).toThrow(UnauthorizedException);
  });

  it('lança UnauthorizedException quando token válido mas isAdmin é false', () => {
    const token = jwtService.sign({ sub: 'admin', isAdmin: false }, { secret: 'test_secret' });
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(UnauthorizedException);
  });

  it('lança UnauthorizedException quando token válido mas sem campo isAdmin', () => {
    const token = jwtService.sign({ sub: 'admin' }, { secret: 'test_secret' });
    expect(() => guard.canActivate(makeContext(`Bearer ${token}`))).toThrow(UnauthorizedException);
  });

  it('retorna true quando token válido com isAdmin: true', () => {
    const token = jwtService.sign({ sub: 'admin', isAdmin: true }, { secret: 'test_secret' });
    const result = guard.canActivate(makeContext(`Bearer ${token}`));
    expect(result).toBe(true);
  });
});
