import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

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
}
