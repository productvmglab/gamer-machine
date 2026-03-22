import { BadRequestException, Body, Controller, Get, Post, Patch, UseGuards, Request } from '@nestjs/common';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(11, 14)
  cpf!: string;
}

class VerifyEmailDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    const user = await this.usersService.findById(req.user.userId);
    return {
      id: user!.id,
      phone: user!.phone,
      name: user!.name,
      balance_cents: user!.balance_cents,
      email: user!.email,
      cpf: user!.cpf,
      email_verified: user!.email_verified,
      profile_locked: user!.profile_locked,
      created_at: user!.created_at.toISOString(),
    };
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Request() req: any, @Body() body: UpdateProfileDto) {
    const { user, emailChanged } = await this.usersService.updateProfile(req.user.userId, body);
    if (emailChanged) {
      await this.usersService.sendEmailVerification(user.id, user.email!);
    }
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      balance_cents: user.balance_cents,
      email: user.email,
      cpf: user.cpf,
      email_verified: user.email_verified,
      profile_locked: user.profile_locked,
      emailChanged,
    };
  }

  @Post('me/email/send-verification')
  @UseGuards(JwtAuthGuard)
  async sendVerification(@Request() req: any) {
    const user = await this.usersService.findById(req.user.userId);
    if (!user?.email) throw new BadRequestException('Nenhum email cadastrado');
    await this.usersService.sendEmailVerification(user.id, user.email);
    return { sent: true };
  }

  @Post('me/email/verify')
  @UseGuards(JwtAuthGuard)
  async verifyEmail(@Request() req: any, @Body() body: VerifyEmailDto) {
    const user = await this.usersService.verifyEmail(req.user.userId, body.code);
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      balance_cents: user.balance_cents,
      email: user.email,
      cpf: user.cpf,
      email_verified: user.email_verified,
      profile_locked: user.profile_locked,
    };
  }
}
