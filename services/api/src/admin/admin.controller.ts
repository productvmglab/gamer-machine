import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './admin-jwt.guard';

class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

class AddCreditDto {
  @IsNumber()
  @IsPositive()
  amount_cents!: number;
}

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.adminService.login(body.username, body.password);
  }

  @Get('users')
  @UseGuards(AdminJwtGuard)
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Get('users/:phone')
  @UseGuards(AdminJwtGuard)
  findUser(@Param('phone') phone: string) {
    return this.adminService.findUserByPhone(phone);
  }

  @Post('users/:phone/credit')
  @UseGuards(AdminJwtGuard)
  addCredit(@Param('phone') phone: string, @Body() body: AddCreditDto) {
    return this.adminService.addCredit(phone, body.amount_cents);
  }

  @Get('users/:phone/deposits')
  @UseGuards(AdminJwtGuard)
  getDepositHistory(@Param('phone') phone: string) {
    return this.adminService.getDepositHistory(phone);
  }

  @Get('users/:phone/sessions')
  @UseGuards(AdminJwtGuard)
  getUsageHistory(@Param('phone') phone: string) {
    return this.adminService.getUsageHistory(phone);
  }
}
