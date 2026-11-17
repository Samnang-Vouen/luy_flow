import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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
    async findAll(): Promise<Session[]> {
        return this.sessionsRepository.find();
    }
    
    async findAllByUser(userId: string): Promise<Session[]> {
        return this.sessionsRepository.find({ where: { userId } });
    }

    async findById(id: string): Promise<Session | null> {
        return this.sessionsRepository.findOne({ where: { id } });
    }

    /**
     * Looks a session up by the SHA-256 hash of its refresh token. Backed by
     * the unique index on `refreshTokenHash`, so this is a single index probe
     * rather than a scan-and-verify across every session.
     */
    async findByRefreshTokenHash(
        refreshTokenHash: string,
    ): Promise<Session | null> {
        return this.sessionsRepository.findOne({
            where: { refreshTokenHash },
        });
    }

    async deleteById(id: string): Promise<void> {
        await this.sessionsRepository.delete({ id });
    }

    async deleteAllByUser(userId: string): Promise<void> {
        await this.sessionsRepository.delete({ userId });
    }

    /** Removes sessions that are already past their expiry (indexed delete). */
    async deleteExpired(): Promise<void> {
        await this.sessionsRepository.delete({
            expiresAt: LessThan(new Date()),
        });
    }

}
