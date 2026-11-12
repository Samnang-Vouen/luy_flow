import { IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
    @ApiProperty()
    @IsNotEmpty()
    resetToken: string;

    @ApiProperty()
    @MinLength(8)
    newPassword: string;
}

