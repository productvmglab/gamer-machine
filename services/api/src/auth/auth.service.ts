import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private smsService: SmsService,
  ) {}

  async sendOtp(phone: string) {
    const user = await this.usersService.findOrCreate(phone);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { phone, code, expires_at },
    });

    await this.smsService.sendSms(phone, `Seu código Gamer Machine: ${code}`);

    return { message: 'OTP sent', expires_at: expires_at.toISOString() };
  }

  async verifyOtp(phone: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        code,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!otp) throw new UnauthorizedException('Invalid or expired OTP');

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });

    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new BadRequestException('User not found');

    const access_token = this.jwtService.sign({ sub: user.id, phone: user.phone });

    return {
      access_token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name ?? null,
        balance_cents: user.balance_cents,
        email: user.email ?? null,
        cpf: user.cpf ?? null,
        email_verified: user.email_verified,
        profile_locked: user.profile_locked,
        created_at: user.created_at.toISOString(),
      },
    };
  }
}
