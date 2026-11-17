import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('sessions')
@Index('IDX_sessions_userId', ['userId'])
@Index('IDX_sessions_expiresAt', ['expiresAt'])
export class Session {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Index('UQ_sessions_refreshTokenHash', { unique: true })
    @Column()
    refreshTokenHash: string;

    @Column({ nullable: true })
    userAgent: string;

    @Column({ nullable: true })
    ipAddress: string;

    @Column()
    expiresAt: Date;

    @CreateDateColumn()
    createdAt: Date;
}
