import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags,} from '@nestjs/swagger';
import type { Request } from 'express';
// import { JwtAuthGuard } from './guards/jwt-auth.guard';
// import { CurrentUser } from './decorators/current-user.decorator';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 409, description: 'Email already in use' })
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login and receive tokens' })
    @ApiResponse({ status: 200, description: 'Access and refresh tokens issued' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async login(@Body() dto: LoginDto, @Req() req: Request) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        return this.authService.login(dto, userAgent, ipAddress);
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
    @ApiResponse({ status: 200, description: 'Rotated access/refresh tokens' })
    @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
    async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        return this.authService.refresh(dto.refreshToken, userAgent, ipAddress);
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Logout and revoke the given session' })
    @ApiResponse({ status: 204, description: 'Session revoked' })
    async logout(@Body() dto: RefreshDto) {
        await this.authService.logout(dto.refreshToken);
    }

    @Post('logout-all')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth('access-token')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Logout from all sessions' })
    @ApiResponse({ status: 200, description: 'All sessions revoked' })
    async logoutAll(@CurrentUser() user: { userId: string }) {
        await this.authService.logoutAll(user.userId);
        return { message: 'All sessions revoked' };
    }

    @Post('forgot-password')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Request a password reset token' })
    @ApiResponse({ status: 202, description: 'Generic reset confirmation' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email exists, a reset link has been sent.' };
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reset password using a reset token' })
    @ApiResponse({ status: 200, description: 'Password updated' })
    @ApiResponse({ status: 401, description: 'Invalid or expired reset token' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.resetToken, dto.newPassword);
    return { message: 'Password updated successfully' };
    }
}