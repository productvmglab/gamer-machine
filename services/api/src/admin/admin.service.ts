import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

@Injectable()
export class AdminService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private usersService: UsersService,
    private gateway: SessionsGateway,
  ) {}

  login(username: string, password: string): { access_token: string } {
    if (
      username !== process.env.ADMIN_USERNAME ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwtService.sign(
      { sub: 'admin', isAdmin: true },
      { secret: process.env.JWT_SECRET ?? 'dev_secret' },
    );
    return { access_token: token };
  }

  async findAllUsers() {
    return this.prisma.user.findMany({ orderBy: { created_at: 'desc' } });
  }

  async findUserByPhone(phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException(`User with phone ${phone} not found`);
    return user;
  }

  async addCredit(phone: string, amount_cents: number) {
    const user = await this.usersService.findOrCreate(phone);

    await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          user_id: user.id,
          amount_cents,
          status: 'paid',
          source: 'admin',
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { balance_cents: { increment: amount_cents } },
      }),
    ]);

    const updatedUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    this.gateway.emitPaymentConfirmed(user.id, updatedUser.balance_cents);
    return updatedUser;
  }

  async getDepositHistory(phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException(`User with phone ${phone} not found`);
    return this.prisma.payment.findMany({
      where: { user_id: user.id, status: 'paid' },
      orderBy: { created_at: 'desc' },
      select: { id: true, amount_cents: true, source: true, created_at: true },
    });
  }

  async getUsageHistory(phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException(`User with phone ${phone} not found`);
    return this.prisma.session.findMany({
      where: { user_id: user.id, ended_at: { not: null } },
      orderBy: { started_at: 'desc' },
      select: { id: true, started_at: true, ended_at: true, duration_seconds: true, cost_cents: true },
    });
  }
}
