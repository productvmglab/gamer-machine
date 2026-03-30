import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const makeUser = (overrides = {}) => ({
  id: 'u1',
  phone: '+5511999999999',
  name: 'Test User',
  balance_seconds: 300,
  email: 'test@example.com',
  cpf: '12345678901',
  email_verified: false,
  profile_locked: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const makeServiceMock = () =>
  ({
    findById: jest.fn(),
    updateProfile: jest.fn(),
    sendEmailVerification: jest.fn(),
    verifyEmail: jest.fn(),
  }) as unknown as UsersService;

const req = { user: { userId: 'u1', phone: '+5511999999999' } };

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    service = makeServiceMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UsersController);
  });

  describe('getMe', () => {
    it('retorna dados do usuário autenticado', async () => {
      const user = makeUser();
      (service.findById as jest.Mock).mockResolvedValue(user);

      const res = await controller.getMe(req);

      expect(service.findById).toHaveBeenCalledWith('u1');
      expect(res).toEqual({
        id: 'u1',
        phone: '+5511999999999',
        name: 'Test User',
        balance_seconds: 300,
        email: 'test@example.com',
        cpf: '12345678901',
        email_verified: false,
        profile_locked: false,
        created_at: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('updateProfile', () => {
    it('atualiza perfil sem disparar verificação de email quando email não mudou', async () => {
      const user = makeUser();
      (service.updateProfile as jest.Mock).mockResolvedValue({ user, emailChanged: false });

      const body = { name: 'Test User', email: 'test@example.com', cpf: '12345678901' } as any;
      const res = await controller.updateProfile(req, body);

      expect(service.updateProfile).toHaveBeenCalledWith('u1', body);
      expect(service.sendEmailVerification).not.toHaveBeenCalled();
      expect(res.emailChanged).toBe(false);
    });

    it('dispara sendEmailVerification quando email mudou', async () => {
      const user = makeUser({ email: 'novo@example.com' });
      (service.updateProfile as jest.Mock).mockResolvedValue({ user, emailChanged: true });
      (service.sendEmailVerification as jest.Mock).mockResolvedValue(undefined);

      const body = { name: 'Test User', email: 'novo@example.com', cpf: '12345678901' } as any;
      await controller.updateProfile(req, body);

      expect(service.sendEmailVerification).toHaveBeenCalledWith('u1', 'novo@example.com');
    });
  });

  describe('sendVerification', () => {
    it('retorna {sent: true} quando usuário tem email', async () => {
      const user = makeUser();
      (service.findById as jest.Mock).mockResolvedValue(user);
      (service.sendEmailVerification as jest.Mock).mockResolvedValue(undefined);

      const res = await controller.sendVerification(req);

      expect(service.sendEmailVerification).toHaveBeenCalledWith('u1', 'test@example.com');
      expect(res).toEqual({ sent: true });
    });

    it('lança BadRequestException quando usuário não tem email', async () => {
      const user = makeUser({ email: null });
      (service.findById as jest.Mock).mockResolvedValue(user);

      await expect(controller.sendVerification(req)).rejects.toThrow(BadRequestException);
      expect(service.sendEmailVerification).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('chama usersService.verifyEmail e retorna user', async () => {
      const user = makeUser({ email_verified: true });
      (service.verifyEmail as jest.Mock).mockResolvedValue(user);

      const res = await controller.verifyEmail(req, { code: '123456' } as any);

      expect(service.verifyEmail).toHaveBeenCalledWith('u1', '123456');
      expect(res.email_verified).toBe(true);
    });
  });
});
