import { JwtService } from '@nestjs/jwt';
import { SessionsGateway } from './sessions.gateway';

const makeServerMock = () => {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { to, emit };
};

const makeSocketMock = (token?: string) =>
  ({
    id: 'socket-1',
    handshake: { auth: { token } },
    disconnect: jest.fn(),
    join: jest.fn(),
  }) as any;

describe('SessionsGateway', () => {
  let gateway: SessionsGateway;
  let jwtService: JwtService;
  let server: ReturnType<typeof makeServerMock>;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test_secret' });
    gateway = new SessionsGateway(jwtService);
    server = makeServerMock();
    gateway.server = server as any;
  });

  describe('handleConnection', () => {
    it('autentica o cliente e associa userId quando token é válido', () => {
      const token = jwtService.sign({ sub: 'u1' }, { secret: 'test_secret' });
      const client = makeSocketMock(token);

      gateway.handleConnection(client);

      expect(client.userId).toBe('u1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('desconecta o cliente quando token é inválido', () => {
      const client = makeSocketMock('token_invalido');

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('desconecta o cliente quando não há token', () => {
      const client = makeSocketMock(undefined);

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('não lança exceção ao desconectar cliente com userId', () => {
      const client = makeSocketMock();
      (client as any).userId = 'u1';

      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });

    it('não lança exceção ao desconectar cliente sem userId', () => {
      const client = makeSocketMock();

      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  describe('handleJoin', () => {
    it('adiciona cliente à room user:{userId} e retorna confirmação', () => {
      const client = makeSocketMock();
      (client as any).userId = 'u1';

      const result = gateway.handleJoin(client);

      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(result).toEqual({ event: 'joined', data: { room: 'user:u1' } });
    });
  });

  describe('emitBalanceUpdate', () => {
    it('emite balance_update para a room do usuário', () => {
      const payload = { balance_seconds: 300, time_remaining_seconds: 240, session_id: 's1' };

      gateway.emitBalanceUpdate('u1', payload);

      expect(server.to).toHaveBeenCalledWith('user:u1');
      expect(server.to('user:u1').emit).toHaveBeenCalledWith('balance_update', payload);
    });
  });

  describe('emitWarning', () => {
    it('emite warning para a room do usuário', () => {
      gateway.emitWarning('u1', { type: 'WARNING_1MIN' });

      expect(server.to).toHaveBeenCalledWith('user:u1');
      expect(server.to('user:u1').emit).toHaveBeenCalledWith('warning', { type: 'WARNING_1MIN' });
    });
  });

  describe('emitPaymentConfirmed', () => {
    it('emite payment_confirmed com balance_seconds para a room do usuário', () => {
      gateway.emitPaymentConfirmed('u1', 600);

      expect(server.to).toHaveBeenCalledWith('user:u1');
      expect(server.to('user:u1').emit).toHaveBeenCalledWith('payment_confirmed', { balance_seconds: 600 });
    });
  });
});
