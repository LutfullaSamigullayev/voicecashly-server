import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsEnum(['UZS', 'USD'])
  defaultCurrency?: 'UZS' | 'USD';

  @IsOptional()
  @IsEnum(['UZ', 'RU', 'EN'])
  language?: 'UZ' | 'RU' | 'EN';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  notifyBudget?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyRecurring?: boolean;
}
