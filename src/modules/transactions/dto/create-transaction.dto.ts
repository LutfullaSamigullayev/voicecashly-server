import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsPositive } from 'class-validator';

export class CreateTransactionDto {
  @IsNumber()
  workspaceId: number;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsEnum(['UZS', 'USD'])
  currency?: 'UZS' | 'USD';

  @IsEnum(['INCOME', 'EXPENSE'])
  type: 'INCOME' | 'EXPENSE';

  @IsNumber()
  categoryId: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(['TELEGRAM', 'MANUAL', 'API'])
  source?: 'TELEGRAM' | 'MANUAL' | 'API';

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  amountUzs?: number;
}
