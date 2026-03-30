import { SmsService } from './sms.service';

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PublishCommand: jest.fn().mockImplementation((input) => input),
}));

const { SNSClient } = require('@aws-sdk/client-sns');

describe('SmsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  });

  describe('modo mock (sem credenciais AWS)', () => {
    it('resolve sem erro e não instancia SNSClient', async () => {
      const service = new SmsService();
      await expect(service.sendSms('+5511999999999', 'Código: 123456')).resolves.toBeUndefined();
      expect(SNSClient).not.toHaveBeenCalled();
    });

    it('não lança exceção para qualquer número e mensagem', async () => {
      const service = new SmsService();
      await expect(service.sendSms('+5521988887777', 'Mensagem de teste')).resolves.not.toThrow();
    });
  });

  describe('modo real (com credenciais AWS)', () => {
    beforeEach(() => {
      process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
      process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      process.env.AWS_REGION = 'sa-east-1';
    });

    it('instancia SNSClient com as credenciais do ambiente', () => {
      new SmsService();
      expect(SNSClient).toHaveBeenCalledWith(expect.objectContaining({
        region: 'sa-east-1',
        credentials: expect.objectContaining({ accessKeyId: 'AKIAIOSFODNN7EXAMPLE' }),
      }));
    });

    it('chama snsClient.send ao enviar SMS', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      SNSClient.mockImplementationOnce(() => ({ send: mockSend }));

      const service = new SmsService();
      await service.sendSms('+5511999999999', 'Código: 123456');

      expect(mockSend).toHaveBeenCalled();
    });
  });
});
