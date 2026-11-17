import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashPassword, hashToken } from './utils/hash.util';
import type { User } from '../users/entities/user.entity';

describe('AuthService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const email = 'demo@example.test';
  const password = 'Password123!';

  let service: AuthService;
  let passwordHash: string;

  let users: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    findByResetTokenHash: jest.Mock;
    createUser: jest.Mock;
    setResetToken: jest.Mock;
    resetPassword: jest.Mock;
  };
  let sessions: {
    createSession: jest.Mock;
    findByRefreshTokenHash: jest.Mock;
    deleteById: jest.Mock;
    deleteAllByUser: jest.Mock;
    deleteExpired: jest.Mock;
  };
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };

  const activeUser = () =>
    ({
      id: userId,
      name: 'Demo User',
      email,
      passwordHash,
      role: 'user',
      isActive: true,
    }) as unknown as User;

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(async () => activeUser()),
      findById: jest.fn(async () => activeUser()),
      findByResetTokenHash: jest.fn(async () => null),
      createUser: jest.fn(),
      setResetToken: jest.fn(async () => undefined),
      resetPassword: jest.fn(async () => undefined),
    };
    sessions = {
      createSession: jest.fn(async () => ({ id: 'session-1' })),
      findByRefreshTokenHash: jest.fn(async () => null),
      deleteById: jest.fn(async () => undefined),
      deleteAllByUser: jest.fn(async () => undefined),
      deleteExpired: jest.fn(async () => undefined),
    };
    jwt = { sign: jest.fn(() => 'access-token') };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_ACCESS_SECRET: 'test-secret',
          JWT_ACCESS_TTL: '900',
          JWT_REFRESH_TTL: '604800',
          NODE_ENV: 'test',
        };
        return values[key];
      }),
    };

    service = new AuthService(
      users as any,
      sessions as any,
      jwt as any,
      config as any,
    );
  });

  describe('login', () => {
    it('issues an access token and stores only the digest of the refresh token', async () => {
      const result = await service.login({ email, password });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toMatch(/^[a-f0-9]{128}$/);

      const [, storedHash] = sessions.createSession.mock.calls[0];
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedHash).toBe(hashToken(result.refreshToken));
    });

    it('rejects a deactivated user with the same message as bad credentials', async () => {
      users.findByEmail.mockResolvedValue({
        ...activeUser(),
        isActive: false,
      });

      await expect(service.login({ email, password })).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it('rejects a wrong password and never creates a session', async () => {
      await expect(
        service.login({ email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessions.createSession).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    const refreshToken = 'a'.repeat(128);
    const liveSession = () => ({
      id: 'session-1',
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    it('looks the session up by digest and rotates the token', async () => {
      sessions.findByRefreshTokenHash.mockResolvedValue(liveSession());

      const result = await service.refresh(refreshToken);

      expect(sessions.findByRefreshTokenHash).toHaveBeenCalledWith(
        hashToken(refreshToken),
      );
      expect(sessions.deleteById).toHaveBeenCalledWith('session-1');
      expect(sessions.deleteExpired).toHaveBeenCalled();
      expect(sessions.createSession).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('access-token');
    });

    it('rejects an unknown token without touching other sessions', async () => {
      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.deleteAllByUser).not.toHaveBeenCalled();
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it('deletes an expired session and rejects', async () => {
      sessions.findByRefreshTokenHash.mockResolvedValue({
        ...liveSession(),
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.refresh(refreshToken)).rejects.toThrow(
        'Refresh token expired',
      );
      expect(sessions.deleteById).toHaveBeenCalledWith('session-1');
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it('revokes every session when the user has been deactivated', async () => {
      sessions.findByRefreshTokenHash.mockResolvedValue(liveSession());
      users.findById.mockResolvedValue({
        ...activeUser(),
        isActive: false,
      });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessions.deleteAllByUser).toHaveBeenCalledWith(userId);
      expect(sessions.createSession).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('deletes the matching session', async () => {
      const refreshToken = 'b'.repeat(128);
      sessions.findByRefreshTokenHash.mockResolvedValue({ id: 'session-1' });

      await service.logout(refreshToken);

      expect(sessions.findByRefreshTokenHash).toHaveBeenCalledWith(
        hashToken(refreshToken),
      );
      expect(sessions.deleteById).toHaveBeenCalledWith('session-1');
    });

    it('is a no-op for an unknown token', async () => {
      await expect(service.logout('c'.repeat(128))).resolves.toBeUndefined();
      expect(sessions.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('stores a SHA-256 digest of the reset token', async () => {
      await service.forgotPassword(email);

      expect(users.setResetToken).toHaveBeenCalledTimes(1);
      const [, resetTokenHash, expiresAt] = users.setResetToken.mock.calls[0];
      expect(resetTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('does nothing for an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);

      await service.forgotPassword('nobody@example.test');

      expect(users.setResetToken).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown or expired token without resetting anything', async () => {
      await expect(
        service.resetPassword('d'.repeat(64), 'NewPassword123!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.resetPassword).not.toHaveBeenCalled();
    });

    it('sets the new password and revokes all sessions', async () => {
      users.findByResetTokenHash.mockResolvedValue(activeUser());
      const resetToken = 'e'.repeat(64);

      await service.resetPassword(resetToken, 'NewPassword123!');

      expect(users.findByResetTokenHash).toHaveBeenCalledWith(
        hashToken(resetToken),
      );
      expect(users.resetPassword).toHaveBeenCalledWith(
        userId,
        expect.stringMatching(/^\$argon2/),
      );
      expect(sessions.deleteAllByUser).toHaveBeenCalledWith(userId);
    });
  });
});
