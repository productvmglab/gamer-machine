import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminJwtGuard } from './admin-jwt.guard';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_secret',
    }),
    UsersModule,
    SessionsModule,
  ],
  providers: [AdminService, AdminJwtGuard],
  controllers: [AdminController],
})
export class AdminModule {}
