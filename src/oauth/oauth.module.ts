import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { OAuthCode } from './entities/oauth-code.entity';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [TypeOrmModule.forFeature([OAuthCode]), AuthModule, UsersModule],
  controllers: [OAuthController],
  providers: [OAuthService],
})
export class OAuthModule {}
