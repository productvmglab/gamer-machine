import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

// A known valid Brazilian CPF (passes the checksum algorithm)
const VALID_CPF = '52998224725';

const makePrismaMock = () =>
  ({
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    emailVerification: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  }) as unknown as PrismaService;

const makeEmailMock = () => ({ sendOtp: jest.fn() }) as unknown as EmailService;
const makeGatewayMock = () => ({ emitPaymentConfirmed: jest.fn() }) as unknown as SessionsGateway;

const makeUser = (overrides = {}) => ({
  id: 'u1',
  phone: '+5511999999999',
  name: 'João Silva',
  email: 'joao@example.com',
  cpf: VALID_CPF,
  balance_seconds: 300,
  email_verified: false,
  profile_locked: false,
  profile_bonus_granted: false,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let emailService: ReturnType<typeof makeEmailMock>;
  let gateway: ReturnType<typeof makeGatewayMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    emailService = makeEmailMock();
    gateway = makeGatewayMock();
    service = new UsersService(prisma, emailService, gateway);
  });

  describe('findOrCreate', () => {
    it('retorna usuário existente quando telefone já existe', async () => {
      const user = makeUser();
      (prisma.user.upsert as jest.Mock).mockResolvedValue(user);

      const result = await service.findOrCreate('+5511999999999');

      expect(result).toEqual(user);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { phone: '+5511999999999' },
        update: {},
        create: { phone: '+5511999999999' },
      });
    });

    it('cria e retorna novo usuário quando telefone não existe', async () => {
      const newUser = makeUser({ id: 'u2', balance_seconds: 0 });
      (prisma.user.upsert as jest.Mock).mockResolvedValue(newUser);

      const result = await service.findOrCreate('+5511888888888');
      expect(result).toEqual(newUser);
    });
  });

  describe('getBalance', () => {
    it('retorna balance_seconds do usuário', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ balance_seconds: 500 });

      const balance = await service.getBalance('u1');

      expect(balance).toBe(500);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { balance_seconds: true },
      });
    });

    it('retorna 0 quando usuário não existe', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      expect(await service.getBalance('inexistente')).toBe(0);
    });
  });

  describe('updateProfile', () => {
    it('lança ForbiddenException quando perfil está bloqueado', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeUser({ profile_locked: true }));

      await expect(
        service.updateProfile('u1', { name: 'Novo Nome', email: 'novo@example.com', cpf: VALID_CPF }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lança BadRequestException para CPF inválido', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeUser());

      await expect(
        service.updateProfile('u1', { name: 'João', email: 'joao@example.com', cpf: '11111111111' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando CPF já pertence a outro usuário', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeUser());
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'u2' }); // CPF conflict

      await expect(
        service.updateProfile('u1', { name: 'João', email: 'joao@example.com', cpf: VALID_CPF }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando email já pertence a outro usuário', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeUser());
      (prisma.user.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)       // CPF sem conflito
        .mockResolvedValueOnce({ id: 'u2' }); // email conflict

      await expect(
        service.updateProfile('u1', { name: 'João', email: 'outro@example.com', cpf: VALID_CPF }),
      ).rejects.toThrow(BadRequestException);
    });

    it('atualiza perfil com sucesso quando email não muda', async () => {
      const user = makeUser({ email: 'joao@example.com' });
      const updated = makeUser({ name: 'João Atualizado' });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateProfile('u1', { name: 'João Atualizado', email: 'joao@example.com', cpf: VALID_CPF });

      expect(result.emailChanged).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.not.objectContaining({ email_verified: false }),
      });
    });

    it('sinaliza emailChanged e reseta email_verified quando email muda', async () => {
      const user = makeUser({ email: 'antigo@example.com' });
      const updated = makeUser({ email: 'novo@example.com', email_verified: false });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateProfile('u1', { name: 'João', email: 'novo@example.com', cpf: VALID_CPF });

      expect(result.emailChanged).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({ email_verified: false }),
      });
    });
  });

  describe('sendEmailVerification', () => {
    it('cria registro de verificação e envia email', async () => {
      (prisma.emailVerification.create as jest.Mock).mockResolvedValue({});
      (emailService.sendOtp as jest.Mock).mockResolvedValue(undefined);

      await service.sendEmailVerification('u1', 'joao@example.com');

      expect(prisma.emailVerification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ user_id: 'u1', email: 'joao@example.com' }),
      });
      expect(emailService.sendOtp).toHaveBeenCalledWith('joao@example.com', expect.any(String));
    });
  });

  describe('verifyEmail', () => {
    it('lança BadRequestException quando usuário não tem email', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeUser({ email: null }));

      await expect(service.verifyEmail('u1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando código é inválido ou expirado', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeUser());
      (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyEmail('u1', '000000')).rejects.toThrow(BadRequestException);
    });

    it('marca verificação como usada e define email_verified = true', async () => {
      const user = makeUser({ name: null, cpf: null }); // perfil incompleto → sem bônus
      const verification = { id: 'ev1' };
      const updatedUser = makeUser({ email_verified: true });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
      (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue(verification);
      (prisma.emailVerification.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.verifyEmail('u1', '123456');

      expect(prisma.emailVerification.update).toHaveBeenCalledWith({
        where: { id: 'ev1' },
        data: { used: true },
      });
      expect(result.email_verified).toBe(true);
    });

    it('não concede bônus quando perfil está incompleto', async () => {
      const user = makeUser({ name: 'J', cpf: null }); // nome curto, sem CPF
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
      (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue({ id: 'ev1' });
      (prisma.emailVerification.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue(makeUser({ email_verified: true }));

      await service.verifyEmail('u1', '123456');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(gateway.emitPaymentConfirmed).not.toHaveBeenCalled();
    });

    it('concede bônus de 5 min e emite payment_confirmed quando perfil está completo', async () => {
      const user = makeUser({ name: 'João Silva', cpf: VALID_CPF, profile_bonus_granted: false });
      const bonusUser = makeUser({ balance_seconds: 600, profile_bonus_granted: true });
      (prisma.user.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce(user)      // início de verifyEmail
        .mockResolvedValueOnce(bonusUser); // após a transaction
      (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue({ id: 'ev1' });
      (prisma.emailVerification.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue(makeUser({ email_verified: true }));
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);

      await service.verifyEmail('u1', '123456');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(gateway.emitPaymentConfirmed).toHaveBeenCalledWith('u1', 600);
    });

    it('não concede bônus novamente quando profile_bonus_granted já é true', async () => {
      const user = makeUser({ name: 'João Silva', cpf: VALID_CPF, profile_bonus_granted: true });
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
      (prisma.emailVerification.findFirst as jest.Mock).mockResolvedValue({ id: 'ev1' });
      (prisma.emailVerification.update as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue(makeUser({ email_verified: true }));

      await service.verifyEmail('u1', '123456');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
