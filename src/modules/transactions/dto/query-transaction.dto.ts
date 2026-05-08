import { IsEnum, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTransactionDto {
  @IsNumber()
  @Type(() => Number)
  workspaceId: number;

  @IsOptional()
  @IsEnum(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  categoryId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20;
}
