import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const makeServiceMock = () =>
  ({
    startSession: jest.fn(),
    endSession: jest.fn(),
  }) as unknown as SessionsService;

const req = { user: { userId: 'u1', phone: '+5511999999999' } };

describe('SessionsController', () => {
  let controller: SessionsController;
  let service: SessionsService;

  beforeEach(async () => {
    service = makeServiceMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [{ provide: SessionsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SessionsController);
  });

  describe('startSession', () => {
    it('chama sessionsService.startSession e retorna a sessão', async () => {
      const session = { id: 's1', user_id: 'u1', started_at: new Date() };
      (service.startSession as jest.Mock).mockResolvedValue(session);

      const res = await controller.startSession(req);

      expect(service.startSession).toHaveBeenCalledWith('u1');
      expect(res).toEqual(session);
    });

    it('repassa BadRequestException quando saldo é insuficiente', async () => {
      (service.startSession as jest.Mock).mockRejectedValue(
        new BadRequestException('Saldo insuficiente'),
      );

      await expect(controller.startSession(req)).rejects.toThrow(BadRequestException);
    });
  });

  describe('endSession', () => {
    it('chama sessionsService.endSession e retorna a sessão encerrada', async () => {
      const session = { id: 's1', duration_seconds: 120, cost_cents: 400 };
      (service.endSession as jest.Mock).mockResolvedValue(session);

      const res = await controller.endSession({ session_id: 's1' } as any);

      expect(service.endSession).toHaveBeenCalledWith('s1');
      expect(res).toEqual(session);
    });

    it('repassa NotFoundException quando sessão não existe', async () => {
      (service.endSession as jest.Mock).mockRejectedValue(
        new NotFoundException('Session not found'),
      );

      await expect(
        controller.endSession({ session_id: 'inexistente' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
