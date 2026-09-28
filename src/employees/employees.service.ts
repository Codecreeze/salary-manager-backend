import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalaryRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMPLOYEE_RELATION_SORT_FIELDS,
  EmployeeRelationSortField,
  ListEmployeesQueryDto,
} from './dto/list-employees-query.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateSalaryRecordDto } from './dto/create-salary-record.dto';

const EMPLOYEE_INCLUDE = {
  department: true,
  country: true,
  manager: {
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  },
} satisfies Prisma.EmployeeInclude;

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: typeof EMPLOYEE_INCLUDE;
}>;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Single source of truth for "current salary" = latest SalaryRecord by
   * effectiveDate. Reused by the employee-detail endpoint and by every
   * analytics query so it is never recomputed ad hoc (RULES.md DRY).
   */
  async getCurrentSalary(employeeId: string): Promise<SalaryRecord | null> {
    return this.prisma.salaryRecord.findFirst({
      where: { employeeId },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Batch variant of getCurrentSalary for list/analytics endpoints that need
   * the latest salary for many employees without N+1 queries: fetch every
   * record ordered so the first row per employeeId encountered is latest.
   */
  async getCurrentSalariesForEmployees(
    employeeIds: string[],
  ): Promise<Map<string, SalaryRecord>> {
    if (employeeIds.length === 0) return new Map();

    const records = await this.prisma.salaryRecord.findMany({
      where: { employeeId: { in: employeeIds } },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });

    const latestByEmployee = new Map<string, SalaryRecord>();
    for (const record of records) {
      if (!latestByEmployee.has(record.employeeId)) {
        latestByEmployee.set(record.employeeId, record);
      }
    }
    return latestByEmployee;
  }

  /**
   * Single where-clause builder for employee search/filter, reused by the
   * list endpoint (and available for any future export/count logic) instead
   * of copy-pasting filter conditions (RULES.md DRY).
   */
  buildWhere(query: ListEmployeesQueryDto): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = {};

    if (query.search) {
      const search = query.search.trim();
      if (search.length > 0) {
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { employeeCode: { contains: search } },
        ];
      }
    }

    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.countryId) where.countryId = query.countryId;
    if (query.jobLevel) where.jobLevel = query.jobLevel;
    if (query.status) where.employmentStatus = query.status;

    return where;
  }

  /**
   * Builds the Prisma `orderBy` clause for the employee list. Relation
   * fields (department/country) need a nested `orderBy` shape rather than
   * a flat `{ [field]: order }`, which would throw at runtime, so they are
   * branched explicitly here (RULES.md: no hacks around Prisma's relation
   * sorting contract).
   */
  private buildOrderBy(
    query: ListEmployeesQueryDto,
  ): Prisma.EmployeeOrderByWithRelationInput {
    const sortBy = query.sortBy ?? 'lastName';
    const sortOrder = query.sortOrder ?? 'asc';

    if (
      EMPLOYEE_RELATION_SORT_FIELDS.includes(
        sortBy as EmployeeRelationSortField,
      )
    ) {
      return { [sortBy]: { name: sortOrder } };
    }

    return { [sortBy]: sortOrder };
  }

  async findAll(query: ListEmployeesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

    const [total, employees] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const salaryByEmployee = await this.getCurrentSalariesForEmployees(
      employees.map((e) => e.id),
    );

    const data = employees.map((employee) =>
      this.toListItem(employee, salaryByEmployee.get(employee.id) ?? null),
    );

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: EMPLOYEE_INCLUDE,
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }

    const [currentSalary, salaryHistory] = await Promise.all([
      this.getCurrentSalary(id),
      this.prisma.salaryRecord.findMany({
        where: { employeeId: id },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      ...this.toDetail(employee),
      currentSalary,
      salaryHistory,
    };
  }

  async create(dto: CreateEmployeeDto) {
    await this.assertEmailUnique(dto.email);
    await this.assertDepartmentExists(dto.departmentId);
    await this.assertCountryExists(dto.countryId);
    if (dto.managerId) {
      await this.assertEmployeeExists(dto.managerId);
    }

    const employeeCode = await this.generateEmployeeCode();

    const employee = await this.prisma.employee.create({
      data: {
        employeeCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        departmentId: dto.departmentId,
        countryId: dto.countryId,
        jobLevel: dto.jobLevel,
        employmentStatus: dto.employmentStatus ?? 'ACTIVE',
        managerId: dto.managerId ?? null,
        hireDate: new Date(dto.hireDate),
        salaryRecords: {
          create: {
            amount: dto.salaryAmount,
            currency: dto.currency,
            effectiveDate: new Date(dto.salaryEffectiveDate ?? dto.hireDate),
            reason: dto.salaryReason ?? 'HIRE',
          },
        },
      },
      include: EMPLOYEE_INCLUDE,
    });

    return this.findOne(employee.id);
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.assertEmployeeExists(id);

    if (dto.email) {
      await this.assertEmailUnique(dto.email, id);
    }
    if (dto.departmentId) {
      await this.assertDepartmentExists(dto.departmentId);
    }
    if (dto.countryId) {
      await this.assertCountryExists(dto.countryId);
    }
    if (dto.managerId) {
      if (dto.managerId === id) {
        throw new ConflictException('An employee cannot be their own manager');
      }
      await this.assertEmployeeExists(dto.managerId);
    }

    await this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        departmentId: dto.departmentId,
        countryId: dto.countryId,
        jobLevel: dto.jobLevel,
        employmentStatus: dto.employmentStatus,
        managerId: dto.managerId,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
      },
    });

    return this.findOne(id);
  }

  async addSalaryRecord(employeeId: string, dto: CreateSalaryRecordDto) {
    await this.assertEmployeeExists(employeeId);

    await this.prisma.salaryRecord.create({
      data: {
        employeeId,
        amount: dto.amount,
        currency: dto.currency,
        effectiveDate: new Date(dto.effectiveDate),
        reason: dto.reason,
      },
    });

    return this.findOne(employeeId);
  }

  private toListItem(
    employee: EmployeeWithRelations,
    currentSalary: SalaryRecord | null,
  ) {
    return { ...this.toDetail(employee), currentSalary };
  }

  private toDetail(employee: EmployeeWithRelations) {
    return employee;
  }

  private async assertEmployeeExists(id: string) {
    const exists = await this.prisma.employee.findUnique({ where: { id } });
    if (!exists) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    return exists;
  }

  private async assertDepartmentExists(departmentId: string) {
    const exists = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!exists) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
  }

  private async assertCountryExists(countryId: string) {
    const exists = await this.prisma.country.findUnique({
      where: { id: countryId },
    });
    if (!exists) {
      throw new NotFoundException(`Country ${countryId} not found`);
    }
  }

  private async assertEmailUnique(email: string, ignoreId?: string) {
    const existing = await this.prisma.employee.findUnique({
      where: { email },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException(`Email ${email} is already in use`);
    }
  }

  private async generateEmployeeCode(): Promise<string> {
    const count = await this.prisma.employee.count();
    let sequence = count + 1;
    // Defend against races/gaps by probing forward until a free code is found.
    for (let attempts = 0; attempts < 1000; attempts++) {
      const code = `EMP-${String(sequence).padStart(5, '0')}`;
      const existing = await this.prisma.employee.findUnique({
        where: { employeeCode: code },
      });
      if (!existing) return code;
      sequence++;
    }
    throw new ConflictException('Unable to generate a unique employee code');
  }
}
