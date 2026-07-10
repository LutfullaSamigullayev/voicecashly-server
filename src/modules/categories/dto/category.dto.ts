import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsNumber()
  @Type(() => Number)
  workspaceId: number;

  @IsString()
  @MaxLength(60)
  nameUz: string;

  @IsString()
  @MaxLength(60)
  nameRu: string;

  @IsString()
  @MaxLength(60)
  nameEn: string;

  @IsEnum(['INCOME', 'EXPENSE', 'BOTH'])
  type: 'INCOME' | 'EXPENSE' | 'BOTH';

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameUz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameRu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nameEn?: string;

  @IsOptional()
  @IsEnum(['INCOME', 'EXPENSE', 'BOTH'])
  type?: 'INCOME' | 'EXPENSE' | 'BOTH';

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
