import { Controller, Post, Body, Headers, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

class CreatePixDto {
  @IsInt()
  @Min(100)
  amount_cents!: number;
}

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('create-pix')
  @UseGuards(JwtAuthGuard)
  createPix(@Request() req: any, @Body() dto: CreatePixDto) {
    return this.paymentsService.createPix(req.user.userId, dto.amount_cents);
  }

  @Post('webhook')
  webhook(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: any,
  ) {
    const expectedSecret = process.env.ABACATEPAY_WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      throw new ForbiddenException('Invalid webhook secret');
    }
    return this.paymentsService.handleWebhook(body.id, body.status);
  }
}
