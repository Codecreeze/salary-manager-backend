import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { EmploymentStatus, JobLevel, SalaryChangeReason } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  departmentId!: string;

  @IsString()
  countryId!: string;

  @IsEnum(JobLevel)
  jobLevel!: JobLevel;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsDateString()
  hireDate!: string;

  // Initial compensation, recorded as a SalaryRecord with reason=HIRE.
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  salaryAmount!: number;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsOptional()
  @IsDateString()
  salaryEffectiveDate?: string;

  @IsOptional()
  @IsEnum(SalaryChangeReason)
  salaryReason?: SalaryChangeReason;
}
