import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmploymentStatus, JobLevel } from '@prisma/client';

export const EMPLOYEE_SORTABLE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'hireDate',
  'jobLevel',
  'employeeCode',
  'department',
  'country',
] as const;
export type EmployeeSortableField = (typeof EMPLOYEE_SORTABLE_FIELDS)[number];

/** Sortable fields that are relations and require a nested Prisma `orderBy`. */
export const EMPLOYEE_RELATION_SORT_FIELDS = ['department', 'country'] as const;
export type EmployeeRelationSortField =
  (typeof EMPLOYEE_RELATION_SORT_FIELDS)[number];

export const EMPLOYEE_SORT_ORDERS = ['asc', 'desc'] as const;
export type EmployeeSortOrder = (typeof EMPLOYEE_SORT_ORDERS)[number];

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsEnum(JobLevel)
  jobLevel?: JobLevel;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;

  @IsOptional()
  @IsIn(EMPLOYEE_SORTABLE_FIELDS)
  sortBy?: EmployeeSortableField = 'lastName';

  @IsOptional()
  @IsIn(EMPLOYEE_SORT_ORDERS)
  sortOrder?: EmployeeSortOrder = 'asc';
}
