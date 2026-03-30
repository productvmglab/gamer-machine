import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

const makeJwtMock = () =>
  ({
    sign: jest.fn().mockReturnValue('admin_token'),
    verify: jest.fn(),
  }) as unknown as JwtService;

const makePrismaMock = () =>
  ({
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
    otpCode: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  }) as unknown as PrismaService;

const makeUsersMock = () =>
  ({
    findByPhone: jest.fn(),
    findOrCreate: jest.fn(),
  }) as unknown as UsersService;

const makeGatewayMock = () =>
  ({
    emitPaymentConfirmed: jest.fn(),
  }) as unknown as SessionsGateway;

const makeUser = (overrides = {}) => ({
  id: 'u1',
  phone: '+5511999999999',
  name: 'Test User',
  balance_seconds: 300,
  barbershop_bonus_granted: false,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('AdminService', () => {
  let service: AdminService;
  let jwtService: ReturnType<typeof makeJwtMock>;
  let prisma: ReturnType<typeof makePrismaMock>;
  let usersService: ReturnType<typeof makeUsersMock>;
  let gateway: ReturnType<typeof makeGatewayMock>;

  beforeEach(() => {
    jwtService = makeJwtMock();
    prisma = makePrismaMock();
    usersService = makeUsersMock();
    gateway = makeGatewayMock();
    service = new AdminService(jwtService, prisma, usersService, gateway);
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'senha123';
  });

  afterEach(() => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });

  describe('login', () => {
    it('retorna access_token com credenciais válidas', () => {
      const result = service.login('admin', 'senha123');
      expect(result).toEqual({ access_token: 'admin_token' });
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'admin', isAdmin: true },
        expect.any(Object),
      );
    });

    it('lança UnauthorizedException com usuário inválido', () => {
      expect(() => service.login('errado', 'senha123')).toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException com senha inválida', () => {
      expect(() => service.login('admin', 'errada')).toThrow(UnauthorizedException);
    });
  });

  describe('findAllUsers', () => {
    it('retorna todos os usuários ordenados por data de criação', async () => {
      const users = [makeUser(), makeUser({ id: 'u2', phone: '+5511888888888' })];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);

      const result = await service.findAllUsers();

      expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: { created_at: 'desc' } });
      expect(result).toHaveLength(2);
    });
  });

  describe('findUserByPhone', () => {
    it('retorna usuário quando encontrado', async () => {
      const user = makeUser();
      (usersService.findByPhone as jest.Mock).mockResolvedValue(user);

      const result = await service.findUserByPhone('+5511999999999');
      expect(result).toEqual(user);
    });

    it('lança NotFoundException quando usuário não existe', async () => {
      (usersService.findByPhone as jest.Mock).mockResolvedValue(null);
      await expect(service.findUserByPhone('+5511000000000')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    it('atualiza nome do usuário', async () => {
      const user = makeUser();
      const updated = makeUser({ name: 'Novo Nome' });
      (usersService.findByPhone as jest.Mock).mockResolvedValue(user);
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateUser('+5511999999999', 'Novo Nome');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'Novo Nome' },
      });
      expect(result.name).toBe('Novo Nome');
    });

    it('lança NotFoundException quando usuário não existe', async () => {
      (usersService.findByPhone as jest.Mock).mockResolvedValue(null);
      await expect(service.updateUser('+5511000000000', 'Nome')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addCredit', () => {
    it('cria pagamento, incrementa saldo e emite payment_confirmed', async () => {
      const user = makeUser();
      const updatedUser = makeUser({ balance_seconds: 600 });
      (usersService.findOrCreate as jest.Mock).mockResolvedValue(user);
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(updatedUser);

      await service.addCredit('+5511999999999', 300);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'u1' } });
      expect(gateway.emitPaymentConfirmed).toHaveBeenCalledWith('u1', 600);
    });
  });

  describe('grantBarbershopBonus', () => {
    it('concede bônus de 5 minutos ao usuário', async () => {
      const user = makeUser({ barbershop_bonus_granted: false });
      const updatedUser = makeUser({ barbershop_bonus_granted: true, balance_seconds: 600 });
      (usersService.findOrCreate as jest.Mock).mockResolvedValue(user);
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(updatedUser);

      await service.grantBarbershopBonus('+5511999999999');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(gateway.emitPaymentConfirmed).toHaveBeenCalledWith('u1', 600);
    });

    it('lança BadRequestException quando bônus já foi concedido', async () => {
      const user = makeUser({ barbershop_bonus_granted: true });
      (usersService.findOrCreate as jest.Mock).mockResolvedValue(user);

      await expect(service.grantBarbershopBonus('+5511999999999')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getActiveOtp', () => {
    it('retorna OTP existente quando há um ativo', async () => {
      const user = makeUser();
      const otp = { code: '123456', expires_at: new Date('2026-03-29T01:00:00Z') };
      (usersService.findOrCreate as jest.Mock).mockResolvedValue(user);
      (prisma.otpCode.findFirst as jest.Mock).mockResolvedValue(otp);

      const result = await service.getActiveOtp('+5511999999999');

      expect(result.code).toBe('123456');
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('cria novo OTP quando não há nenhum ativo', async () => {
      const user = makeUser();
      const newOtp = { code: '654321', expires_at: new Date('2026-03-29T01:05:00Z') };
      (usersService.findOrCreate as jest.Mock).mockResolvedValue(user);
      (prisma.otpCode.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.otpCode.create as jest.Mock).mockResolvedValue(newOtp);

      const result = await service.getActiveOtp('+5511999999999');

      expect(prisma.otpCode.create).toHaveBeenCalled();
      expect(result.code).toBe('654321');
    });
  });

  describe('getDepositHistory', () => {
    it('retorna histórico de depósitos do usuário', async () => {
      const user = makeUser();
      const deposits = [
        { id: 'd1', amount_cents: 0, balance_seconds: 300, source: 'admin', created_at: new Date() },
      ];
      (usersService.findByPhone as jest.Mock).mockResolvedValue(user);
      (prisma.payment.findMany as jest.Mock).mockResolvedValue(deposits);

      const result = await service.getDepositHistory('+5511999999999');

      expect(prisma.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { user_id: 'u1', status: 'paid' },
      }));
      expect(result).toHaveLength(1);
    });

    it('lança NotFoundException quando usuário não existe', async () => {
      (usersService.findByPhone as jest.Mock).mockResolvedValue(null);
      await expect(service.getDepositHistory('+5511000000000')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUsageHistory', () => {
    it('retorna histórico de sessões do usuário', async () => {
      const user = makeUser();
      const sessions = [
        { id: 's1', started_at: new Date(), ended_at: new Date(), duration_seconds: 300, cost_cents: 0 },
      ];
      (usersService.findByPhone as jest.Mock).mockResolvedValue(user);
      (prisma.session.findMany as jest.Mock).mockResolvedValue(sessions);

      const result = await service.getUsageHistory('+5511999999999');

      expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { user_id: 'u1', ended_at: { not: null } },
      }));
      expect(result).toHaveLength(1);
    });

    it('lança NotFoundException quando usuário não existe', async () => {
      (usersService.findByPhone as jest.Mock).mockResolvedValue(null);
      await expect(service.getUsageHistory('+5511000000000')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMonthlyReport', () => {
    it('retorna zeros quando não há pagamentos no mês', async () => {
      (prisma.payment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMonthlyReport('2026-03');

      expect(result.pix_revenue_cents).toBe(0);
      expect(result.admin_total_seconds).toBe(0);
      expect(result.admin_excess_seconds).toBe(0);
      expect(result.excess_details).toHaveLength(0);
    });

    it('calcula receita PIX e distribui corretamente (20/20/30/30)', async () => {
      (prisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([{ amount_cents: 1000 }, { amount_cents: 1000 }]) // pix
        .mockResolvedValueOnce([]); // admin

      const result = await service.getMonthlyReport('2026-03');

      expect(result.pix_revenue_cents).toBe(2000);
      expect(result.distribuicao.manutencao_cents).toBe(400);  // 20%
      expect(result.distribuicao.barbearia_cents).toBe(400);   // 20%
      expect(result.distribuicao.vinicius_cents).toBe(600);    // 30%
      expect(result.distribuicao.marcos_cents).toBe(600);      // 30%
    });

    it('soma créditos admin dentro do limite semanal sem excedente', async () => {
      // Two credits in the same week (2026-W10), total = 200s < 300s limit
      const adminCredits = [
        { user_id: 'u1', balance_seconds: 100, created_at: new Date('2026-03-02T10:00:00Z'), user: { phone: '+5511999999999', name: 'João' } },
        { user_id: 'u1', balance_seconds: 100, created_at: new Date('2026-03-03T10:00:00Z'), user: { phone: '+5511999999999', name: 'João' } },
      ];
      (prisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([])          // pix
        .mockResolvedValueOnce(adminCredits); // admin

      const result = await service.getMonthlyReport('2026-03');

      expect(result.admin_total_seconds).toBe(200);
      expect(result.admin_excess_seconds).toBe(0);
      expect(result.excess_details).toHaveLength(0);
    });

    it('calcula excedente quando créditos admin ultrapassam limite semanal de 300s', async () => {
      // Two credits in same week (2026-W10), total = 400s → excess = 100s
      const adminCredits = [
        { user_id: 'u1', balance_seconds: 200, created_at: new Date('2026-03-02T10:00:00Z'), user: { phone: '+5511999999999', name: 'João' } },
        { user_id: 'u1', balance_seconds: 200, created_at: new Date('2026-03-03T10:00:00Z'), user: { phone: '+5511999999999', name: 'João' } },
      ];
      (prisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(adminCredits);

      const result = await service.getMonthlyReport('2026-03');

      expect(result.admin_total_seconds).toBe(400);
      expect(result.admin_excess_seconds).toBe(100);
      expect(result.excess_details).toHaveLength(1);
      expect(result.excess_details[0]).toMatchObject({
        user_phone: '+5511999999999',
        semana: '2026-W10',
        total_seconds: 400,
        bonus_seconds: 300,
        excesso_seconds: 100,
      });
    });

    it('não agrega excedente quando créditos de mesmo usuário estão em semanas diferentes', async () => {
      // Same user, different weeks (W10 and W11) — each 200s, both within 300s limit
      const adminCredits = [
        { user_id: 'u1', balance_seconds: 200, created_at: new Date('2026-03-02T10:00:00Z'), user: { phone: '+5511999999999', name: 'João' } },
        { user_id: 'u1', balance_seconds: 200, created_at: new Date('2026-03-09T10:00:00Z'), user: { phone: '+5511999999999', name: 'João' } },
      ];
      (prisma.payment.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(adminCredits);

      const result = await service.getMonthlyReport('2026-03');

      expect(result.admin_total_seconds).toBe(400);
      expect(result.admin_excess_seconds).toBe(0);
      expect(result.excess_details).toHaveLength(0);
    });
  });
});
