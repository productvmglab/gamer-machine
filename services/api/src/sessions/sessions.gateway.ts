import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import type { BalanceUpdatePayload, WarningPayload } from '@gamer-machine/shared';
import { SessionsService } from './sessions.service';

@WebSocketGateway({ namespace: '/sessions', cors: { origin: '*' } })
export class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SessionsGateway.name);

  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => SessionsService))
    private sessionsService: SessionsService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      const payload = this.jwtService.verify(token);
      (client as any).userId = payload.sub;
      this.logger.log(`Client connected: ${client.id} user: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).userId as string | undefined;
    this.logger.log(`Client disconnected: ${client.id}`);
    if (!userId) return;
    try {
      const active = await this.sessionsService.findActiveSession(userId);
      if (active) {
        this.logger.log(`Ending orphaned session ${active.id} for user ${userId}`);
        await this.sessionsService.endSession(active.id);
      }
    } catch (err) {
      this.logger.error(`Failed to end session on disconnect for user ${userId}`, err);
    }
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket) {
    const userId = (client as any).userId as string;
    client.join(`user:${userId}`);
    return { event: 'joined', data: { room: `user:${userId}` } };
  }

  emitBalanceUpdate(userId: string, data: BalanceUpdatePayload) {
    this.server.to(`user:${userId}`).emit('balance_update', data);
  }

  emitWarning(userId: string, data: WarningPayload) {
    this.server.to(`user:${userId}`).emit('warning', data);
  }

  emitPaymentConfirmed(userId: string, balanceCents: number) {
    this.server.to(`user:${userId}`).emit('payment_confirmed', { balance_cents: balanceCents });
  }
}
