import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A one-time authorization code, issued when a user taps Allow on /oauth/authorize
 * and exchanged by the client at /oauth/token. Deleted when used; valid 10 minutes.
 */
@Entity('oauth_codes')
export class OAuthCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SHA-256 of the code. The code itself is never stored. */
  @Index('UQ_oauth_codes_codeHash', { unique: true })
  @Column({ type: 'char', length: 64 })
  codeHash: string;

  @Column({ type: 'varchar', length: 100 })
  clientId: string;

  @Column('uuid')
  userId: string;

  /** Must match the redirect_uri sent with the token request. */
  @Column({ type: 'varchar', length: 500 })
  redirectUri: string;

  /** PKCE S256 challenge: base64url(sha256(code_verifier)). */
  @Column({ type: 'varchar', length: 128 })
  codeChallenge: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  scope: string | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
