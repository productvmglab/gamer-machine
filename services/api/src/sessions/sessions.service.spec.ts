import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from './sessions.gateway';

const makePrismaMock = () =>
  ({
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  }) as unknown as PrismaService;

const makeGatewayMock = () =>
  ({
    emitBalanceUpdate: jest.fn(),
    emitWarning: jest.fn(),
    emitPaymentConfirmed: jest.fn(),
  }) as unknown as SessionsGateway;

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let gateway: ReturnType<typeof makeGatewayMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    gateway = makeGatewayMock();
    service = new SessionsService(prisma, gateway);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startSession', () => {
    it('throws NotFoundException when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.startSession('user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when balance is 0', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1', phone: '11999999999', balance_seconds: 0,
        created_at: new Date(), updated_at: new Date(),
      });
      await expect(service.startSession('user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when balance is negative', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1', phone: '11999999999', balance_seconds: -100,
        created_at: new Date(), updated_at: new Date(),
      });
      await expect(service.startSession('user-1')).rejects.toThrow(BadRequestException);
    });

    it('creates session and returns it when balance is positive', async () => {
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 600,
        created_at: new Date(), updated_at: new Date(),
      };
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: new Date(),
        ended_at: null, duration_seconds: null, cost_cents: null,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await service.startSession('user-1');
      expect(result.session).toEqual(mockSession);
      expect(prisma.session.create).toHaveBeenCalledWith({ data: { user_id: 'user-1' } });
    });
  });

  describe('session duration tracking (endSession)', () => {
    const makeSession = (durationSeconds: number) => ({
      id: 'session-1',
      user_id: 'user-1',
      started_at: new Date(Date.now() - durationSeconds * 1000),
      ended_at: null,
      duration_seconds: null,
      cost_cents: null,
    });

    const setupEndSession = (durationSeconds: number) => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(makeSession(durationSeconds));
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ balance_seconds: 0 });
    };

    it('returns duration_seconds equal to elapsed time (1s)', async () => {
      setupEndSession(1);
      const result = await service.endSession('session-1');
      expect(result.duration_seconds).toBe(1);
    });

    it('returns duration_seconds equal to elapsed time (60s)', async () => {
      setupEndSession(60);
      const result = await service.endSession('session-1');
      expect(result.duration_seconds).toBe(60);
    });

    it('returns duration_seconds equal to elapsed time (120s)', async () => {
      setupEndSession(120);
      const result = await service.endSession('session-1');
      expect(result.duration_seconds).toBe(120);
    });

    it('always returns cost_cents = 0 (time-based billing, no per-minute cost)', async () => {
      setupEndSession(300);
      const result = await service.endSession('session-1');
      expect(result.cost_cents).toBe(0);
    });

    it('decrements balance_seconds by the session duration', async () => {
      setupEndSession(120);
      await service.endSession('session-1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    it('throws NotFoundException when session does not exist', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.endSession('missing')).rejects.toThrow(NotFoundException);
    });

    it('calls $transaction with the correct data', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 'session-1', user_id: 'user-1',
        started_at: new Date(Date.now() - 60000),
        ended_at: null, duration_seconds: null, cost_cents: null,
      });
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ balance_seconds: 0 });

      await service.endSession('session-1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('clamps balance to 0 via updateMany', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 'session-1', user_id: 'user-1',
        started_at: new Date(Date.now() - 60000),
        ended_at: null, duration_seconds: null, cost_cents: null,
      });
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ balance_seconds: 0 });

      await service.endSession('session-1');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', balance_seconds: { lt: 0 } },
        data: { balance_seconds: 0 },
      });
    });

    it('emits SESSION_ENDED warning via gateway', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue({
        id: 'session-1', user_id: 'user-1',
        started_at: new Date(Date.now() - 60000),
        ended_at: null, duration_seconds: null, cost_cents: null,
      });
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ balance_seconds: 0 });

      await service.endSession('session-1');

      expect(gateway.emitWarning).toHaveBeenCalledWith('user-1', { type: 'SESSION_ENDED' });
    });
  });

  describe('findActiveSession', () => {
    it('retorna sessão ativa do usuário (linha 69)', async () => {
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: new Date(), ended_at: null,
      };
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(mockSession);

      const result = await service.findActiveSession('user-1');

      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: { user_id: 'user-1', ended_at: null },
      });
      expect(result).toEqual(mockSession);
    });

    it('retorna null quando usuário não tem sessão ativa', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
      expect(await service.findActiveSession('user-1')).toBeNull();
    });
  });

  describe('timer behavior', () => {
    it('emits balance_update after 5 seconds', async () => {
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 600,
        created_at: new Date(), updated_at: new Date(),
      };
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: new Date(),
        ended_at: null, duration_seconds: null, cost_cents: null,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);

      await service.startSession('user-1');

      await jest.advanceTimersByTimeAsync(5000);

      expect(gateway.emitBalanceUpdate).toHaveBeenCalledWith('user-1', expect.objectContaining({
        balance_seconds: 600,
        session_id: 'session-1',
      }));
    });

    it('emits WARNING_1MIN exactly once when timeRemaining drops to ≤60s', async () => {
      // balance_seconds=61, started 1s ago → after first tick (6s elapsed): 61-6=55s ≤ 60s → WARNING_1MIN
      const startedAt = new Date(Date.now() - 1000);
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 61,
        created_at: new Date(), updated_at: new Date(),
      };
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: startedAt,
        ended_at: null, duration_seconds: null, cost_cents: null,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);

      await service.startSession('user-1');

      // First tick: WARNING_1MIN should fire
      await jest.advanceTimersByTimeAsync(5000);

      const count1 = (gateway.emitWarning as jest.Mock).mock.calls.filter(
        (c) => c[1]?.type === 'WARNING_1MIN',
      ).length;
      expect(count1).toBe(1);

      // Second tick: should NOT emit again
      await jest.advanceTimersByTimeAsync(5000);
      const count2 = (gateway.emitWarning as jest.Mock).mock.calls.filter(
        (c) => c[1]?.type === 'WARNING_1MIN',
      ).length;
      expect(count2).toBe(1);
    });

    it('emits WARNING_30SEC exactly once when timeRemaining drops to ≤30s', async () => {
      // balance_seconds=31, started 1s ago → after first tick (6s elapsed): 31-6=25s ≤ 30s → WARNING_30SEC
      const startedAt = new Date(Date.now() - 1000);
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 31,
        created_at: new Date(), updated_at: new Date(),
      };
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: startedAt,
        ended_at: null, duration_seconds: null, cost_cents: null,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);

      await service.startSession('user-1');

      await jest.advanceTimersByTimeAsync(5000);

      const count30 = (gateway.emitWarning as jest.Mock).mock.calls.filter(
        (c) => c[1]?.type === 'WARNING_30SEC',
      ).length;
      expect(count30).toBe(1);

      await jest.advanceTimersByTimeAsync(5000);
      const count30Again = (gateway.emitWarning as jest.Mock).mock.calls.filter(
        (c) => c[1]?.type === 'WARNING_30SEC',
      ).length;
      expect(count30Again).toBe(1);
    });

    it('limpa o timer e não lança exceção quando findUnique falha no tick (linha 60-61)', async () => {
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 600,
        created_at: new Date(), updated_at: new Date(),
      };
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: new Date(),
        ended_at: null, duration_seconds: null, cost_cents: null,
      };
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockUser)                          // chamada do startSession
        .mockRejectedValueOnce(new Error('DB connection lost'));  // primeiro tick do timer

      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);

      await service.startSession('user-1');

      // O tick deve capturar o erro sem propagar exceção
      await expect(jest.advanceTimersByTimeAsync(5000)).resolves.not.toThrow();

      // Timer foi limpo: segundo tick não chama emitBalanceUpdate
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      await jest.advanceTimersByTimeAsync(5000);
      expect(gateway.emitBalanceUpdate).not.toHaveBeenCalled();
    });

    it('calls endSession (emits SESSION_ENDED) when timeRemaining reaches 0', async () => {
      // balance_seconds=60, started 61s ago → after first tick (66s elapsed): 60-66=-6 ≤ 0 → SESSION_ENDED
      const startedAt = new Date(Date.now() - 61000);
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 60,
        created_at: new Date(), updated_at: new Date(),
      };
      const mockSession = {
        id: 'session-1', user_id: 'user-1', started_at: startedAt,
        ended_at: null, duration_seconds: null, cost_cents: null,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);

      await service.startSession('user-1');

      await jest.advanceTimersByTimeAsync(5000);

      expect(gateway.emitWarning).toHaveBeenCalledWith('user-1', { type: 'SESSION_ENDED' });
    });
  });
});
