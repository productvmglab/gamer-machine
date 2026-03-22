import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter | null;

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      this.transporter = null;
    }
  }

  async sendOtp(email: string, code: string): Promise<void> {
    if (!this.transporter) {
      console.log(`[EMAIL MOCK] Para: ${email} | Código: ${code}`);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@gamermachine.com',
      to: email,
      subject: 'Confirmação de email - Gamer Machine',
      text: `Seu código de verificação é: ${code}\nExpira em 10 minutos.`,
    });
  }
}
