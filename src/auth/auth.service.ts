import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, verifyPassword } from './utils/hash.util';

@Injectable()
export class AuthService {
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
        const refreshTokenHash = await hashPassword(refreshToken);
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

    async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

    const isValid = await verifyPassword(user.passwordHash, dto.password);
    if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createSessionWithRefreshToken(
        user.id,
        userAgent,
        ipAddress,
    );

    return { accessToken, refreshToken };
    }

    async refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
        const sessions = await this.sessionsService.findAll();

    let matchedSession = null;
    for (const session of sessions) {
        try {
        const isMatch = await verifyPassword(
            session.refreshTokenHash,
            refreshToken,
        );
        if (isMatch) {
            matchedSession = session;
            break;
        }
        } catch {
        // skip sessions with malformed/invalid hash data
        continue;
        }
    }

    if (!matchedSession) {
        throw new UnauthorizedException('Invalid refresh token');
    }

    if (matchedSession.expiresAt.getTime() < Date.now()) {
        await this.sessionsService.deleteById(matchedSession.id);
        throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersService.findById(matchedSession.userId);
    if (!user) {
        throw new UnauthorizedException('User not found');
    }

    await this.sessionsService.deleteById(matchedSession.id);

    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.createSessionWithRefreshToken(
        user.id,
        userAgent,
        ipAddress,
        );

        return { accessToken, refreshToken: newRefreshToken };
    }

    async logout(refreshToken: string): Promise<void> {
        const sessions = await this.sessionsService.findAll();

    for (const session of sessions) {
        try {
            const isMatch = await verifyPassword(
            session.refreshTokenHash,
            refreshToken,
            );
            if (isMatch) {
            await this.sessionsService.deleteById(session.id);
            return;
            }
        } catch {
            continue;
        }
        }
    }

    async logoutAll(userId: string): Promise<void> {
        await this.sessionsService.deleteAllByUser(userId);
    }
}
