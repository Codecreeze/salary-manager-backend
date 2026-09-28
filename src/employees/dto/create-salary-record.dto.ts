import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsPositive, IsString, Min, MinLength } from 'class-validator';
import { SalaryChangeReason } from '@prisma/client';

export class CreateSalaryRecordDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  amount!: number;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsDateString()
  effectiveDate!: string;

  @IsEnum(SalaryChangeReason)
  reason!: SalaryChangeReason;
}
