import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Text fields sent alongside the uploaded file (multipart/form-data). */
export class CreateImportDto {
  @ApiProperty({ description: 'The account this statement belongs to' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Import profile with the column mapping for this bank' })
  @IsUUID()
  profileId: string;
}

/** The subset of the Multer file object this module uses. */
export interface UploadedStatementFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}
