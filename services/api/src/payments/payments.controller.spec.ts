import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const makeServiceMock = () =>
  ({
    createPix: jest.fn(),
    handleWebhook: jest.fn(),
  }) as unknown as PaymentsService;

const req = { user: { userId: 'u1', phone: '+5511999999999' } };

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: PaymentsService;

  beforeEach(async () => {
    service = makeServiceMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PaymentsController);
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
  });

  describe('createPix', () => {
    it('chama paymentsService.createPix e retorna os dados do QR code', async () => {
      const result = { id: 'pay1', qr_code_text: 'pix_code', qr_code_base64: 'base64img' };
      (service.createPix as jest.Mock).mockResolvedValue(result);

      const res = await controller.createPix(req, { package_id: 'pack_5min' } as any);

      expect(service.createPix).toHaveBeenCalledWith('u1', 'pack_5min');
      expect(res).toEqual(result);
    });
  });

  describe('webhook', () => {
    it('aceita webhook sem validar secret quando env var não está definida', async () => {
      (service.handleWebhook as jest.Mock).mockResolvedValue({ received: true });

      const res = await controller.webhook('qualquer_coisa', { id: 'pay1', status: 'PAID' });

      expect(service.handleWebhook).toHaveBeenCalledWith('pay1', 'PAID');
      expect(res).toEqual({ received: true });
    });

    it('aceita webhook com secret correto quando env var está definida', async () => {
      process.env.ABACATEPAY_WEBHOOK_SECRET = 'meu_secret';
      (service.handleWebhook as jest.Mock).mockResolvedValue({ received: true });

      const res = await controller.webhook('meu_secret', { id: 'pay1', status: 'PAID' });

      expect(service.handleWebhook).toHaveBeenCalledWith('pay1', 'PAID');
      expect(res).toEqual({ received: true });
    });

    it('lança ForbiddenException quando secret está errado', async () => {
      process.env.ABACATEPAY_WEBHOOK_SECRET = 'meu_secret';

      expect(() =>
        controller.webhook('secret_errado', { id: 'pay1', status: 'PAID' }),
      ).toThrow(ForbiddenException);

      expect(service.handleWebhook).not.toHaveBeenCalled();
    });

    it('passa status não-PAID para o service sem filtrar no controller', async () => {
      (service.handleWebhook as jest.Mock).mockResolvedValue({ received: true });

      await controller.webhook(undefined as any, { id: 'pay1', status: 'PENDING' });

      expect(service.handleWebhook).toHaveBeenCalledWith('pay1', 'PENDING');
    });
  });
});
