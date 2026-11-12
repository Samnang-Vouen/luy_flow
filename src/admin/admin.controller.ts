import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

    @ApiTags('admin')
    @ApiBearerAuth('access-token')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @Controller('admin')
    export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get('users')
    @ApiOperation({ summary: 'List all users (admin only)' })
    @ApiResponse({ status: 200, description: 'Paginated list of users' })
    async listUsers(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.adminService.listUsers(
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
        );
    }

    @Get('users/:id')
    @ApiOperation({ summary: 'View a user account (admin only)' })
    @ApiResponse({ status: 200, description: 'User account details' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getUser(@Param('id', ParseUUIDPipe) id: string) {
        return this.adminService.getUserDetails(id);
    }

    @Patch('users/:id/status')
    @ApiOperation({ summary: 'Activate or deactivate a user (admin only)' })
    @ApiResponse({ status: 200, description: 'Updated user status' })
    @ApiResponse({
        status: 400,
        description: 'Cannot deactivate self or last admin',
    })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserStatusDto,
        @CurrentUser() user: { userId: string },
    ) {
        return this.adminService.updateUserStatus(id, dto.isActive, user.userId);
    }

    @Patch('users/:id/role')
    @ApiOperation({ summary: "Change a user's role (admin only)" })
    @ApiResponse({ status: 200, description: 'Updated user role' })
    @ApiResponse({ status: 400, description: "Cannot remove last admin's role" })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateRole(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserRoleDto,
        @CurrentUser() user: { userId: string },
    ) {
        return this.adminService.updateUserRole(id, dto.role, user.userId);
    }
}
