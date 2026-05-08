import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsPositive } from 'class-validator';

export class UpdateTransactionDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsEnum(['UZS', 'USD'])
  currency?: 'UZS' | 'USD';

  @IsOptional()
  @IsEnum(['INCOME', 'EXPENSE'])
  type?: 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
