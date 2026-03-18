import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AbacatePayClient } from './abacatepay.client';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  providers: [PaymentsService, AbacatePayClient],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
