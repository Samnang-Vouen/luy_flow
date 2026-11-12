import { Controller, Body, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get('me')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Current user profile' })
    async getMe(@CurrentUser() user: { userId: string }) {
        const fullUser = await this.usersService.findById(user.userId);
        return {
        id: fullUser?.id,
        name: fullUser?.name,
        email: fullUser?.email,
        role: fullUser?.role,
        preferences: fullUser?.preferences,
        };
    }

    @Patch('me')
    @ApiOperation({ summary: 'Update current user profile' })
    @ApiResponse({ status: 200, description: 'Updated profile' })
    async updateMe(
        @CurrentUser() user: { userId: string },
        @Body() dto: UpdateProfileDto,
    ) {
        const updated = await this.usersService.updateProfile(user.userId, dto);
        return {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            role: updated.role,
            preferences: updated.preferences,
        };
    }
    @Patch('me/password')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Change current user password' })
    @ApiResponse({ status: 204, description: 'Password changed' })
    @ApiResponse({ status: 401, description: 'Current password incorrect' })
    async changePassword(
        @CurrentUser() user: { userId: string },
        @Body() dto: ChangePasswordDto,
    ) {
        await this.usersService.changePassword(
            user.userId,
            dto.currentPassword,
            dto.newPassword,
        );
    }

}
