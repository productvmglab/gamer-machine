import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionsGateway } from './sessions.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_secret',
    }),
  ],
  providers: [
    { provide: SessionsService, useClass: SessionsService },
    { provide: SessionsGateway, useClass: SessionsGateway },
  ],
  controllers: [SessionsController],
  exports: [SessionsService, SessionsGateway],
})
export class SessionsModule {}
