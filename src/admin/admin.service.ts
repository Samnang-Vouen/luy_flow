import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class AdminService {
    constructor(private readonly usersService: UsersService) {}

    async listUsers(page = 1, limit = 20) {
        const [users, total] = await this.usersService.findAllPaginated(
        page,
        limit,
        );
        return {
        data: users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            isActive: u.isActive,
            createdAt: u.createdAt,
        })),
        total,
        page,
        limit,
        };
    }

    async getUserDetails(userId: string) {
        const user = await this.usersService.findById(userId);
        if (!user) {
        throw new NotFoundException('User not found');
        }
        return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        };
    }

    async updateUserStatus(
        userId: string,
        isActive: boolean,
        requestingUserId: string,
    ) {
        const targetUser = await this.usersService.findById(userId);
        if (!targetUser) {
        throw new NotFoundException('User not found');
        }

        if (targetUser.id === requestingUserId && !isActive) {
        throw new BadRequestException('You cannot deactivate your own account');
        }

        if (targetUser.role === UserRole.ADMIN && !isActive) {
        const activeAdmins = await this.usersService.countActiveAdmins();
        if (activeAdmins <= 1) {
            throw new BadRequestException(
            'Cannot deactivate the last active admin',
            );
        }
        }

        const updated = await this.usersService.updateStatus(userId, isActive);
        return {
        id: updated.id,
        isActive: updated.isActive,
        };
    }

    async updateUserRole(
        userId: string,
        role: UserRole,
        requestingUserId: string,
    ) {
        const targetUser = await this.usersService.findById(userId);
        if (!targetUser) {
        throw new NotFoundException('User not found');
        }

        if (
        targetUser.id === requestingUserId &&
        targetUser.role === UserRole.ADMIN &&
        role !== UserRole.ADMIN
        ) {
        const activeAdmins = await this.usersService.countActiveAdmins();
        if (activeAdmins <= 1) {
            throw new BadRequestException(
            "Cannot remove the last active admin's admin role",
            );
        }
        }

        const updated = await this.usersService.updateRole(userId, role);
        return {
        id: updated.id,
        role: updated.role,
        };
    }
}
