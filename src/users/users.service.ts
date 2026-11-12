import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { hashPassword, verifyPassword } from '../auth/utils/hash.util';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) { }
    
    async findByEmail(email: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { email } });
    }

    async findById(id: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { id } });
    }

    async createUser(
        name: string,
        email: string,
        passwordHash: string,
    ): Promise<User> {
        const existing = await this.findByEmail(email);
        if (existing) {
            throw new ConflictException('Email already in use');
        }

        const user = this.usersRepository.create({
            name,
            email,
            passwordHash,
        });
        return this.usersRepository.save(user);
    }
    async updateProfile(
        userId: string,
        updates: { name?: string; preferences?: Record<string, any> },
    ): Promise<User> {
        const user = await this.findById(userId);
        if (!user) {
        throw new NotFoundException('User not found');
        }

        if (updates.name !== undefined) {
        user.name = updates.name;
        }
        if (updates.preferences !== undefined) {
        user.preferences = updates.preferences;
        }

        return this.usersRepository.save(user);
    }
    async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<void> {
        const user = await this.findById(userId);
        if (!user) {
        throw new NotFoundException('User not found');
        }

        const isValid = await verifyPassword(user.passwordHash, currentPassword);
        if (!isValid) {
        throw new UnauthorizedException('Current password is incorrect');
        }

        user.passwordHash = await hashPassword(newPassword);
        await this.usersRepository.save(user);
    }

    async setResetToken(
        userId: string,
        resetTokenHash: string,
        expiresAt: Date,
    ): Promise<void> {
        await this.usersRepository.update(userId, {
            resetPasswordTokenHash: resetTokenHash,
            resetPasswordExpiresAt: expiresAt,
        });
    }

        async findAll(): Promise<User[]> {
        return this.usersRepository.find();
    }

    async resetPassword(userId: string, newPasswordHash: string): Promise<void> {
        await this.usersRepository.update(userId, {
            passwordHash: newPasswordHash,
            resetPasswordTokenHash: null,
            resetPasswordExpiresAt: null,
        });
    }
    
    async findAllPaginated(page: number, limit: number): Promise<[User[], number]> {
        return this.usersRepository.findAndCount({
            skip: (page - 1) * limit,
            take: limit,
            order: { createdAt: 'DESC' },
        });
        }

    async countActiveAdmins(): Promise<number> {
    return this.usersRepository.count({
        where: { role: UserRole.ADMIN, isActive: true },
    });
}

    async updateStatus(userId: string, isActive: boolean): Promise<User> {
        const user = await this.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        user.isActive = isActive;
        return this.usersRepository.save(user);
    }

    async updateRole(userId: string, role: UserRole): Promise<User> {
        const user = await this.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        user.role = role;
        return this.usersRepository.save(user);
    }

}
