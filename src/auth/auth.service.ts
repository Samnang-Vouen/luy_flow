import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, hashToken, verifyPassword } from './utils/hash.util';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly sessionsService: SessionsService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async register(dto: RegisterDto) {
        const passwordHash = await hashPassword(dto.password);
        const user = await this.usersService.createUser(
        dto.name,
        dto.email,
        passwordHash,
    );

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        };
    }

    private generateAccessToken(user: {
        id: string;
        email: string;
        role: string;
    }) {
        return this.jwtService.sign(
        { sub: user.id, email: user.email, role: user.role },
        {
            secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
            expiresIn: Number(this.configService.get('JWT_ACCESS_TTL')),
        },
        );
    }

    private async createSessionWithRefreshToken(
        userId: string,
        userAgent?: string,
        ipAddress?: string,
    ) {
        const refreshToken = randomBytes(64).toString('hex');
        const refreshTokenHash = hashToken(refreshToken);
        const ttlSeconds = Number(this.configService.get('JWT_REFRESH_TTL'));
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.sessionsService.createSession(
        userId,
        refreshTokenHash,
        expiresAt,
        userAgent,
        ipAddress,
        );

        return refreshToken;
    }

    /**
     * The user for this email and password, or null when the email is unknown,
     * the password is wrong or the account is deactivated. Callers must not tell
     * these cases apart: a deactivated account looks like a non-existent one.
     */
    async validateCredentials(email: string, password: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user) return null;

        const isValid = await verifyPassword(user.passwordHash, password);
        if (!isValid || !user.isActive) return null;

        return user;
    }

    /** Access + refresh token for a user who has already been authenticated (password login or OAuth). */
    async issueTokens(
        user: { id: string; email: string; role: string },
        userAgent?: string,
        ipAddress?: string,
    ) {
        const accessToken = this.generateAccessToken(user);
        const refreshToken = await this.createSessionWithRefreshToken(
            user.id,
            userAgent,
            ipAddress,
        );
        return { accessToken, refreshToken };
    }

    async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
        const user = await this.validateCredentials(dto.email, dto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.issueTokens(user, userAgent, ipAddress);
    }

    async refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
        // Single indexed lookup by the token's digest — no scan, no Argon2.
        const session = await this.sessionsService.findByRefreshTokenHash(
            hashToken(refreshToken),
        );

        if (!session) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        if (session.expiresAt.getTime() < Date.now()) {
            await this.sessionsService.deleteById(session.id);
            throw new UnauthorizedException('Refresh token expired');
        }

        const user = await this.usersService.findById(session.userId);
        if (!user || !user.isActive) {
            // Deactivated or deleted: drop every session this user holds.
            await this.sessionsService.deleteAllByUser(session.userId);
            throw new UnauthorizedException('Invalid refresh token');
        }

        // Rotate: the presented token is single-use.
        await this.sessionsService.deleteById(session.id);
        // Opportunistic cleanup; the DELETE is backed by IDX_sessions_expiresAt.
        await this.sessionsService.deleteExpired();

        const accessToken = this.generateAccessToken(user);
        const newRefreshToken = await this.createSessionWithRefreshToken(
            user.id,
            userAgent,
            ipAddress,
        );

        return { accessToken, refreshToken: newRefreshToken };
    }

    async logout(refreshToken: string): Promise<void> {
        const session = await this.sessionsService.findByRefreshTokenHash(
            hashToken(refreshToken),
        );

        // Unknown or already-rotated tokens are a no-op: logout is idempotent.
        if (session) {
            await this.sessionsService.deleteById(session.id);
        }
    }

    async logoutAll(userId: string): Promise<void> {
        await this.sessionsService.deleteAllByUser(userId);
    }


    async forgotPassword(email: string): Promise<void> {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            // Don't reveal whether the email exists — generic response either way
            return;
        }

        const resetToken = randomBytes(32).toString('hex');
        const resetTokenHash = hashToken(resetToken);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

        await this.usersService.setResetToken(user.id, resetTokenHash, expiresAt);

        if (this.configService.get('NODE_ENV') !== 'production') {
            // No mail transport is configured yet. In production this branch is
            // skipped and the token never leaves the process.
            this.logger.debug(`Password reset token for ${email}: ${resetToken}`);
        }
    }

    async resetPassword(resetToken: string, newPassword: string): Promise<void> {
        // Expiry is part of the WHERE clause, so an expired token is simply
        // "not found" — one indexed lookup instead of scanning every user.
        const user = await this.usersService.findByResetTokenHash(
            hashToken(resetToken),
        );

        if (!user) {
            throw new UnauthorizedException('Invalid or expired reset token');
        }

        const newPasswordHash = await hashPassword(newPassword);
        await this.usersService.resetPassword(user.id, newPasswordHash);

        // Also revoke all sessions for safety after password reset
        await this.sessionsService.deleteAllByUser(user.id);
    }
}
