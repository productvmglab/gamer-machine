import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import type { BalanceUpdatePayload, WarningPayload } from '@gamer-machine/shared';

@WebSocketGateway({ namespace: '/sessions', cors: { origin: '*' } })
export class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SessionsGateway.name);

  constructor(private jwtService: JwtService) {}

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

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId as string | undefined;
    this.logger.log(`Client disconnected: ${client.id} user: ${userId ?? 'unknown'}`);
    // Session lifecycle is managed by the server-side timer in SessionsService.
    // Do NOT end sessions on disconnect — the DashboardScreen and other clients
    // also connect to this namespace and their disconnect must not end the session.
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
