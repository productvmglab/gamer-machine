import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

const makePrismaMock = () =>
  ({
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  }) as unknown as PrismaService;

const makeEmailMock = () => ({ sendOtp: jest.fn() }) as unknown as EmailService;
const makeGatewayMock = () => ({ emitPaymentConfirmed: jest.fn() }) as unknown as SessionsGateway;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const mockUser = {
    id: 'user-1', phone: '11999999999', balance_cents: 500,
    created_at: new Date(), updated_at: new Date(),
  };

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new UsersService(prisma, makeEmailMock(), makeGatewayMock());
  });

  describe('findOrCreate', () => {
    it('returns existing user when phone already exists', async () => {
      (prisma.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOrCreate('11999999999');

      expect(result).toEqual(mockUser);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { phone: '11999999999' },
        update: {},
        create: { phone: '11999999999' },
      });
    });

    it('creates and returns a new user when phone does not exist', async () => {
      const newUser = { ...mockUser, id: 'user-2', balance_cents: 0 };
      (prisma.user.upsert as jest.Mock).mockResolvedValue(newUser);

      const result = await service.findOrCreate('11988888888');

      expect(result).toEqual(newUser);
    });
  });

  describe('getBalance', () => {
    it('returns balance_cents for existing user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ balance_cents: 500 });

      const balance = await service.getBalance('user-1');

      expect(balance).toBe(500);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { balance_cents: true },
      });
    });

    it('returns 0 when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const balance = await service.getBalance('nonexistent');

      expect(balance).toBe(0);
    });
  });
});
