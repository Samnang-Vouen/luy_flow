import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';

@Injectable()
export class SessionsService {
    constructor(
        @InjectRepository(Session)
        private readonly sessionsRepository: Repository<Session>,
    ) {}

    async createSession(
        userId: string,
        refreshTokenHash: string,
        expiresAt: Date,
        userAgent?: string,
        ipAddress?: string,
    ): Promise<Session> {
    const session: Session = this.sessionsRepository.create({
        userId,
        refreshTokenHash,
        expiresAt,
        userAgent,
        ipAddress,
        });
        return this.sessionsRepository.save(session);
    }
    
    async findAllByUser(userId: string): Promise<Session[]> {
        return this.sessionsRepository.find({ where: { userId } });
    }

    async findById(id: string): Promise<Session | null> {
        return this.sessionsRepository.findOne({ where: { id } });
    }

    async deleteById(id: string): Promise<void> {
        await this.sessionsRepository.delete({ id });
    }

    async deleteAllByUser(userId: string): Promise<void> {
        await this.sessionsRepository.delete({ userId });
    }

}
