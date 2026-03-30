import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './admin-jwt.guard';

const makeAdminUser = (overrides = {}) => ({
  id: 'u1',
  phone: '+5511999999999',
  name: 'Test User',
  balance_seconds: 300,
  barbershop_bonus_granted: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const makeServiceMock = () =>
  ({
    login: jest.fn(),
    findAllUsers: jest.fn(),
    findUserByPhone: jest.fn(),
    updateUser: jest.fn(),
    addCredit: jest.fn(),
    grantBarbershopBonus: jest.fn(),
    getActiveOtp: jest.fn(),
    getDepositHistory: jest.fn(),
    getUsageHistory: jest.fn(),
    getMonthlyReport: jest.fn(),
  }) as unknown as AdminService;

describe('AdminController', () => {
  let controller: AdminController;
  let service: AdminService;

  beforeEach(async () => {
    service = makeServiceMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: service }],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminController);
  });

  describe('login', () => {
    it('retorna token quando credenciais são válidas', async () => {
      const result = { access_token: 'admin_jwt' };
      (service.login as jest.Mock).mockResolvedValue(result);

      const res = await controller.login({ username: 'admin', password: 'senha' } as any);

      expect(service.login).toHaveBeenCalledWith('admin', 'senha');
      expect(res).toEqual(result);
    });

    it('repassa UnauthorizedException quando credenciais são inválidas', async () => {
      (service.login as jest.Mock).mockRejectedValue(new UnauthorizedException());

      await expect(
        controller.login({ username: 'admin', password: 'errada' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findAllUsers', () => {
    it('retorna lista de usuários', async () => {
      const users = [makeAdminUser(), makeAdminUser({ id: 'u2', phone: '+5511888888888' })];
      (service.findAllUsers as jest.Mock).mockResolvedValue(users);

      const res = await controller.findAllUsers();

      expect(service.findAllUsers).toHaveBeenCalled();
      expect(res).toHaveLength(2);
    });
  });

  describe('findUser', () => {
    it('retorna usuário pelo telefone', async () => {
      const user = makeAdminUser();
      (service.findUserByPhone as jest.Mock).mockResolvedValue(user);

      const res = await controller.findUser('+5511999999999');

      expect(service.findUserByPhone).toHaveBeenCalledWith('+5511999999999');
      expect(res).toEqual(user);
    });
  });

  describe('updateUser', () => {
    it('chama adminService.updateUser com phone e name', async () => {
      const user = makeAdminUser({ name: 'Novo Nome' });
      (service.updateUser as jest.Mock).mockResolvedValue(user);

      const res = await controller.updateUser('+5511999999999', { name: 'Novo Nome' } as any);

      expect(service.updateUser).toHaveBeenCalledWith('+5511999999999', 'Novo Nome');
      expect(res).toEqual(user);
    });
  });

  describe('addCredit', () => {
    it('chama adminService.addCredit com phone e balance_seconds', async () => {
      const user = makeAdminUser({ balance_seconds: 600 });
      (service.addCredit as jest.Mock).mockResolvedValue(user);

      const res = await controller.addCredit('+5511999999999', { balance_seconds: 300 } as any);

      expect(service.addCredit).toHaveBeenCalledWith('+5511999999999', 300);
      expect(res).toEqual(user);
    });
  });

  describe('grantBarbershopBonus', () => {
    it('chama adminService.grantBarbershopBonus e retorna usuário atualizado', async () => {
      const user = makeAdminUser({ balance_seconds: 600, barbershop_bonus_granted: true });
      (service.grantBarbershopBonus as jest.Mock).mockResolvedValue(user);

      const res = await controller.grantBarbershopBonus('+5511999999999');

      expect(service.grantBarbershopBonus).toHaveBeenCalledWith('+5511999999999');
      expect(res.barbershop_bonus_granted).toBe(true);
    });
  });

  describe('getActiveOtp', () => {
    it('retorna OTP ativo do usuário', async () => {
      const otp = { code: '123456', expires_at: '2026-03-29T00:05:00.000Z' };
      (service.getActiveOtp as jest.Mock).mockResolvedValue(otp);

      const res = await controller.getActiveOtp('+5511999999999');

      expect(service.getActiveOtp).toHaveBeenCalledWith('+5511999999999');
      expect(res).toEqual(otp);
    });
  });

  describe('getDepositHistory', () => {
    it('retorna histórico de depósitos do usuário', async () => {
      const deposits = [{ id: 'dep1', amount_cents: 500 }, { id: 'dep2', amount_cents: 1000 }];
      (service.getDepositHistory as jest.Mock).mockResolvedValue(deposits);

      const res = await controller.getDepositHistory('+5511999999999');

      expect(service.getDepositHistory).toHaveBeenCalledWith('+5511999999999');
      expect(res).toHaveLength(2);
    });
  });

  describe('getUsageHistory', () => {
    it('retorna histórico de sessões do usuário', async () => {
      const sessions = [{ id: 's1', duration_seconds: 300 }];
      (service.getUsageHistory as jest.Mock).mockResolvedValue(sessions);

      const res = await controller.getUsageHistory('+5511999999999');

      expect(service.getUsageHistory).toHaveBeenCalledWith('+5511999999999');
      expect(res).toHaveLength(1);
    });
  });

  describe('getMonthlyReport', () => {
    it('passa o parâmetro month para adminService.getMonthlyReport', async () => {
      const report = { month: '2026-03', pix_revenue_cents: 5000 };
      (service.getMonthlyReport as jest.Mock).mockResolvedValue(report);

      const res = await controller.getMonthlyReport('2026-03');

      expect(service.getMonthlyReport).toHaveBeenCalledWith('2026-03');
      expect(res).toEqual(report);
    });
  });
});
