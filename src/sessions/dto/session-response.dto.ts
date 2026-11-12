import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    userAgent: string;

    @ApiProperty()
    ipAddress: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    expiresAt: Date;
}
