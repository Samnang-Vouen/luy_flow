import { IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
    @ApiProperty()
    @IsNotEmpty()
    currentPassword: string;

    @ApiProperty()
    @MinLength(8)
    newPassword: string;
}
