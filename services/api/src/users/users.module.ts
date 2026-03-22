import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmailService } from '../email/email.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  providers: [UsersService, EmailService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
