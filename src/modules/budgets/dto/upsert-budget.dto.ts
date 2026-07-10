import { IsEnum, IsNumber, IsPositive, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertBudgetDto {
  @IsNumber()
  @Type(() => Number)
  workspaceId: number;

  @IsNumber()
  @Type(() => Number)
  categoryId: number;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(['UZS', 'USD'])
  currency: 'UZS' | 'USD';

  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2000)
  year: number;
}
