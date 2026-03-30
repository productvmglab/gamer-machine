import { AbacatePayClient } from './abacatepay.client';

describe('AbacatePayClient', () => {
  let client: AbacatePayClient;

  beforeEach(() => {
    global.fetch = jest.fn();
    delete process.env.ABACATEPAY_API_KEY;
  });

  afterEach(() => {
    delete process.env.ABACATEPAY_API_KEY;
  });

  describe('modo mock (sem ABACATEPAY_API_KEY)', () => {
    beforeEach(() => {
      client = new AbacatePayClient();
    });

    it('retorna dados mock sem chamar fetch', async () => {
      const result = await client.createPixBilling(1000, '+5511999999999');

      expect(fetch).not.toHaveBeenCalled();
      expect(result.id).toMatch(/^mock_/);
      expect(result.brCode).toBeTruthy();
      expect(result.brCodeBase64).toBeTruthy();
    });

    it('retorna brCodeBase64 com conteúdo (PNG base64 1x1)', async () => {
      const result = await client.createPixBilling(500, '+5521988887777');
      // 1x1 PNG base64 starts with iVBOR
      expect(result.brCodeBase64).toMatch(/^iVBOR/);
    });
  });

  describe('modo real (com ABACATEPAY_API_KEY)', () => {
    beforeEach(() => {
      process.env.ABACATEPAY_API_KEY = 'test_api_key_123';
      client = new AbacatePayClient();
    });

    it('chama a API AbacatePay com método POST e authorization correta', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          success: true,
          data: { id: 'abacate-abc', url: 'https://pay.abacatepay.com/abc' },
        }),
      });

      await client.createPixBilling(1000, '+5511999999999');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/billing/create'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test_api_key_123' }),
        }),
      );
    });

    it('retorna id e brCode (url) da resposta da API', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          success: true,
          data: { id: 'abacate-xyz', url: 'https://pay.abacatepay.com/xyz' },
        }),
      });

      const result = await client.createPixBilling(1000, '+5511999999999');

      expect(result).toEqual({ id: 'abacate-xyz', brCode: 'https://pay.abacatepay.com/xyz', brCodeBase64: '' });
    });

    it('lança Error quando a API retorna success: false', async () => {
      (fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          success: false,
          error: 'Invalid API key',
        }),
      });

      await expect(client.createPixBilling(1000, '+5511999999999')).rejects.toThrow(
        'AbacatePay error: Invalid API key',
      );
    });
  });
});
