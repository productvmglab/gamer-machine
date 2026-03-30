import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const makeServiceMock = () =>
  ({
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
  }) as unknown as AuthService;

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    service = makeServiceMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('sendOtp', () => {
    it('delega para authService.sendOtp e retorna o resultado', async () => {
      const result = { message: 'OTP sent', expires_at: '2026-03-29T00:05:00.000Z' };
      (service.sendOtp as jest.Mock).mockResolvedValue(result);

      const res = await controller.sendOtp({ phone: '+5511999999999' } as any);

      expect(service.sendOtp).toHaveBeenCalledWith('+5511999999999');
      expect(res).toEqual(result);
    });
  });

  describe('verifyOtp', () => {
    it('delega para authService.verifyOtp e retorna token + user', async () => {
      const result = { access_token: 'jwt_token', user: { id: 'u1', phone: '+5511999999999', balance_seconds: 0 } };
      (service.verifyOtp as jest.Mock).mockResolvedValue(result);

      const res = await controller.verifyOtp({ phone: '+5511999999999', code: '123456' } as any);

      expect(service.verifyOtp).toHaveBeenCalledWith('+5511999999999', '123456');
      expect(res).toEqual(result);
    });

    it('repassa UnauthorizedException quando OTP é inválido', async () => {
      (service.verifyOtp as jest.Mock).mockRejectedValue(new UnauthorizedException('Invalid OTP'));

      await expect(
        controller.verifyOtp({ phone: '+5511999999999', code: '000000' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
