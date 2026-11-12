import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'crypto'
import { UsersService } from '../users/users.service'
import { SessionsService } from '../sessions/sessions.service'
import { RegisterDto } from '../auth/dto/register.dto'
import { LoginDto } from '../auth/dto/login.dto'
import { hashPassword, verifyPassword } from '../auth/utils/hash.util'

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly sessionsService: SessionsService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

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
    
    async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isValid = await verifyPassword(user.passwordHash, dto.password);
        if (!isValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const accessToken = this.jwtService.sign(
            { sub: user.id, email: user.email, role: user.role },
            {
                secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
                expiresIn: Number(this.configService.get('JWT_ACCESS_TTL')),
            },
        );


        const refreshToken = randomBytes(64).toString('hex');
        const refreshTokenHash = await hashPassword(refreshToken);

        const ttlSeconds = Number(this.configService.get('JWT_REFRESH_TTL'));
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

        await this.sessionsService.createSession(
            user.id,
            refreshToken,
            expiresAt,
            userAgent,
            ipAddress,
        );
        return { accessToken, refreshToken };
    }
}
