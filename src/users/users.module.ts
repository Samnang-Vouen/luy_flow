import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity'
import { SessionsModule } from '../sessions/sessions.module'

@Module({
  imports: [TypeOrmModule.forFeature([User]), SessionsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}