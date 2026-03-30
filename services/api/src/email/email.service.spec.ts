import { EmailService } from './email.service';

jest.mock('nodemailer');
const nodemailer = require('nodemailer');

describe('EmailService', () => {
  let mockSendMail: jest.Mock;

  beforeEach(() => {
    mockSendMail = jest.fn().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  describe('modo mock (sem SMTP_HOST)', () => {
    it('resolve sem erro e não cria transporter', async () => {
      const service = new EmailService();
      await expect(service.sendOtp('user@example.com', '123456')).resolves.toBeUndefined();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  describe('modo real (com SMTP_HOST)', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'senha';
    });

    it('cria transporter com as configurações do ambiente', () => {
      new EmailService();
      expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
      }));
    });

    it('chama transporter.sendMail com destinatário e código corretos', async () => {
      const service = new EmailService();
      await service.sendOtp('destino@example.com', '654321');

      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'destino@example.com',
        text: expect.stringContaining('654321'),
      }));
    });

    it('usa SMTP_FROM quando definido', async () => {
      process.env.SMTP_FROM = 'noreply@meudominio.com';
      const service = new EmailService();
      await service.sendOtp('user@example.com', '111222');

      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
        from: 'noreply@meudominio.com',
      }));
    });
  });
});
