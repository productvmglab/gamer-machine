import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AbacatePayClient } from './abacatepay.client';
import { SessionsGateway } from '../sessions/sessions.gateway';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private abacatePay: AbacatePayClient,
    private gateway: SessionsGateway,
  ) {}

  async createPix(userId: string, amountCents: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const pixData = await this.abacatePay.createPixBilling(amountCents, user.phone);

    const payment = await this.prisma.payment.create({
      data: {
        user_id: userId,
        amount_cents: amountCents,
        abacatepay_id: pixData.id,
        qr_code: pixData.brCodeBase64,
        qr_code_text: pixData.brCode,
      },
    });

    return {
      payment: {
        id: payment.id,
        abacatepay_id: payment.abacatepay_id,
        user_id: payment.user_id,
        amount_cents: payment.amount_cents,
        status: payment.status,
        qr_code: payment.qr_code,
        qr_code_text: payment.qr_code_text,
        created_at: payment.created_at.toISOString(),
      },
    };
  }

  async handleWebhook(abacatepayId: string, status: string) {
    if (status !== 'PAID') return { received: true };

    const payment = await this.prisma.payment.findUnique({
      where: { abacatepay_id: abacatepayId },
    });
    if (!payment) {
      this.logger.warn(`Webhook: payment not found for abacatepay_id=${abacatepayId}`);
      return { received: true };
    }
    if (payment.status === 'paid') {
      this.logger.warn(`Webhook: payment ${payment.id} already paid`);
      return { received: true };
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'paid' },
      }),
      this.prisma.user.update({
        where: { id: payment.user_id },
        data: { balance_cents: { increment: payment.amount_cents } },
      }),
    ]);

    const updatedUser = await this.prisma.user.findUnique({ where: { id: payment.user_id } });
    this.gateway.emitPaymentConfirmed(payment.user_id, updatedUser!.balance_cents);

    this.logger.log(`Payment ${payment.id} confirmed, added ${payment.amount_cents} cents to user ${payment.user_id}`);
    return { received: true };
  }
}
