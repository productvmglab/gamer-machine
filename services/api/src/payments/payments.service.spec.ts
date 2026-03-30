import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbacatePayClient } from './abacatepay.client';
import { SessionsGateway } from '../sessions/sessions.gateway';

const makePrismaMock = () =>
  ({
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  }) as unknown as PrismaService;

const makeAbacatePayMock = () =>
  ({
    createPixBilling: jest.fn(),
  }) as unknown as AbacatePayClient;

const makeGatewayMock = () =>
  ({
    emitPaymentConfirmed: jest.fn(),
  }) as unknown as SessionsGateway;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let abacatePay: ReturnType<typeof makeAbacatePayMock>;
  let gateway: ReturnType<typeof makeGatewayMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    abacatePay = makeAbacatePayMock();
    gateway = makeGatewayMock();
    service = new PaymentsService(prisma, abacatePay, gateway);
  });

  describe('createPix', () => {
    it('creates a Payment record with the correct abacatepay_id', async () => {
      const mockUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 0,
        created_at: new Date(), updated_at: new Date(),
      };
      const pixData = { id: 'abacate-123', brCode: 'pix-code', brCodeBase64: 'base64data' };
      // pack_5min: price_cents=1000, balance_seconds=300 (5 minutes)
      const mockPayment = {
        id: 'pay-1', user_id: 'user-1', amount_cents: 1000, balance_seconds: 300,
        abacatepay_id: 'abacate-123', status: 'pending',
        qr_code: 'base64data', qr_code_text: 'pix-code',
        created_at: new Date(),
      };

      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(mockUser);
      (abacatePay.createPixBilling as jest.Mock).mockResolvedValue(pixData);
      (prisma.payment.create as jest.Mock).mockResolvedValue(mockPayment);

      const result = await service.createPix('user-1', 'pack_5min');

      expect(result.payment.abacatepay_id).toBe('abacate-123');
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          abacatepay_id: 'abacate-123',
          amount_cents: 1000,
          balance_seconds: 300,
        }),
      });
    });
  });

  describe('handleWebhook', () => {
    it('returns {received:true} without touching DB when status is not PAID', async () => {
      const result = await service.handleWebhook('abacate-123', 'PENDING');
      expect(result).toEqual({ received: true });
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('returns {received:true} when payment not found', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.handleWebhook('abacate-missing', 'PAID');
      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns {received:true} idempotently when payment is already paid', async () => {
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        id: 'pay-1', user_id: 'user-1', amount_cents: 1000, balance_seconds: 300,
        abacatepay_id: 'abacate-123', status: 'paid',
        qr_code: null, qr_code_text: null, created_at: new Date(),
      });
      const result = await service.handleWebhook('abacate-123', 'PAID');
      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('happy path: updates status, increments balance, emits payment_confirmed', async () => {
      const pendingPayment = {
        id: 'pay-1', user_id: 'user-1', amount_cents: 1000, balance_seconds: 300,
        abacatepay_id: 'abacate-123', status: 'pending',
        qr_code: null, qr_code_text: null, created_at: new Date(),
      };
      const updatedUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 300,
        created_at: new Date(), updated_at: new Date(),
      };

      (prisma.payment.findUnique as jest.Mock).mockResolvedValue(pendingPayment);
      (prisma.$transaction as jest.Mock).mockResolvedValue([null, null]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.handleWebhook('abacate-123', 'PAID');

      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(gateway.emitPaymentConfirmed).toHaveBeenCalledWith('user-1', 300);
    });

    it('idempotency: calling twice with same ID increments balance only once', async () => {
      const pendingPayment = {
        id: 'pay-1', user_id: 'user-1', amount_cents: 1000, balance_seconds: 300,
        abacatepay_id: 'abacate-123', status: 'pending',
        qr_code: null, qr_code_text: null, created_at: new Date(),
      };
      const paidPayment = { ...pendingPayment, status: 'paid' };
      const updatedUser = {
        id: 'user-1', phone: '11999999999', balance_seconds: 300,
        created_at: new Date(), updated_at: new Date(),
      };

      // First call: payment is pending
      (prisma.payment.findUnique as jest.Mock).mockResolvedValueOnce(pendingPayment);
      (prisma.$transaction as jest.Mock).mockResolvedValueOnce([null, null]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(updatedUser);
      await service.handleWebhook('abacate-123', 'PAID');

      // Second call: payment already paid
      (prisma.payment.findUnique as jest.Mock).mockResolvedValueOnce(paidPayment);
      await service.handleWebhook('abacate-123', 'PAID');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(gateway.emitPaymentConfirmed).toHaveBeenCalledTimes(1);
    });
  });
});
