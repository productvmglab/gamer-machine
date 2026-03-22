import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

export function validateCPF(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const [len, pos] of [[9, 10], [10, 11]] as const) {
    const sum = Array.from({ length: len }, (_, i) => +d[i] * (len + 1 - i)).reduce((a, b) => a + b);
    let rem = (sum * 10) % 11;
    if (rem >= 10) rem = 0;
    if (rem !== +d[pos - 1]) return false;
  }
  return true;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private gateway: SessionsGateway,
  ) {}

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findOrCreate(phone: string) {
    return this.prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });
  }

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balance_cents: true },
    });
    return user?.balance_cents ?? 0;
  }

  async updateProfile(userId: string, data: { name: string; email: string; cpf: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.profile_locked) {
      throw new ForbiddenException('Perfil bloqueado. Para alterações, fale com o atendimento.');
    }

    if (!validateCPF(data.cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    const cpfDigits = data.cpf.replace(/\D/g, '');

    // Check CPF uniqueness (excluding self)
    const cpfConflict = await this.prisma.user.findFirst({
      where: { cpf: cpfDigits, NOT: { id: userId } },
    });
    if (cpfConflict) throw new BadRequestException('CPF já cadastrado');

    // Check email uniqueness (excluding self)
    const emailConflict = await this.prisma.user.findFirst({
      where: { email: data.email, NOT: { id: userId } },
    });
    if (emailConflict) throw new BadRequestException('Email já cadastrado');

    const emailChanged = user.email !== data.email;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        cpf: cpfDigits,
        // Reset email_verified if email changed
        ...(emailChanged ? { email_verified: false } : {}),
      },
    });

    return { user: updated, emailChanged };
  }

  async sendEmailVerification(userId: string, email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.emailVerification.create({
      data: { user_id: userId, email, code, expires_at },
    });

    await this.emailService.sendOtp(email, code);
  }

  async verifyEmail(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.email) {
      throw new BadRequestException('Nenhum email cadastrado');
    }

    const verification = await this.prisma.emailVerification.findFirst({
      where: {
        user_id: userId,
        email: user.email,
        code,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!verification) {
      throw new BadRequestException('Código inválido ou expirado');
    }

    await this.prisma.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    const profileComplete =
      (user.name?.length ?? 0) >= 2 &&
      user.cpf !== null &&
      validateCPF(user.cpf);

    let updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { email_verified: true },
    });

    if (profileComplete && !user.profile_bonus_granted) {
      await this.prisma.$transaction([
        this.prisma.payment.create({
          data: { user_id: userId, amount_cents: 1000, status: 'paid', source: 'admin' },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: {
            balance_cents: { increment: 1000 },
            profile_bonus_granted: true,
            profile_locked: true,
          },
        }),
      ]);

      updatedUser = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      this.gateway.emitPaymentConfirmed(userId, updatedUser.balance_cents);
    }

    return updatedUser;
  }
}
