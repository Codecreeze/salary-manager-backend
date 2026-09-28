import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  let prisma: PrismaService;
  let service: EmployeesService;

  let departmentId: string;
  let countryId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new EmployeesService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.salaryRecord.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.country.deleteMany();
    await prisma.department.deleteMany();

    const department = await prisma.department.create({
      data: { name: 'Engineering' },
    });
    const country = await prisma.country.create({
      data: { name: 'United States', code: 'US' },
    });
    departmentId = department.id;
    countryId = country.id;
  });

  async function createEmployee(overrides: {
    email: string;
    jobLevel?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
    salaryAmount?: number;
  }) {
    return service.create({
      firstName: 'Jane',
      lastName: 'Doe',
      email: overrides.email,
      departmentId,
      countryId,
      jobLevel: overrides.jobLevel ?? 'L2',
      hireDate: '2022-01-01',
      salaryAmount: overrides.salaryAmount ?? 60000,
      currency: 'USD',
    });
  }

  describe('getCurrentSalary', () => {
    it('returns the latest salary record by effectiveDate, not creation order', async () => {
      const employee = await createEmployee({ email: 'jane@acme.example' });

      // Insert an earlier-created record with a *later* effectiveDate, and
      // a later-created record with an *earlier* effectiveDate, to prove
      // resolution is by effectiveDate, not insertion order.
      await prisma.salaryRecord.create({
        data: {
          employeeId: employee.id,
          amount: 90000,
          currency: 'USD',
          effectiveDate: new Date('2024-06-01'),
          reason: 'PROMOTION',
        },
      });
      await prisma.salaryRecord.create({
        data: {
          employeeId: employee.id,
          amount: 70000,
          currency: 'USD',
          effectiveDate: new Date('2023-01-01'),
          reason: 'MERIT',
        },
      });

      const current = await service.getCurrentSalary(employee.id);
      expect(current?.amount).toBe(90000);
      expect(current?.reason).toBe('PROMOTION');
    });

    it('returns null when the employee has no salary records', async () => {
      const current = await service.getCurrentSalary('nonexistent-id');
      expect(current).toBeNull();
    });
  });

  describe('getCurrentSalariesForEmployees', () => {
    it('resolves the latest salary per employee in a single batch', async () => {
      const a = await createEmployee({ email: 'a@acme.example' });
      const b = await createEmployee({ email: 'b@acme.example' });

      await prisma.salaryRecord.create({
        data: {
          employeeId: b.id,
          amount: 120000,
          currency: 'USD',
          effectiveDate: new Date('2025-01-01'),
          reason: 'MERIT',
        },
      });

      const map = await service.getCurrentSalariesForEmployees([a.id, b.id]);
      expect(map.get(a.id)?.amount).toBe(60000); // HIRE record
      expect(map.get(b.id)?.amount).toBe(120000); // latest MERIT record
    });

    it('returns an empty map for an empty input array', async () => {
      const map = await service.getCurrentSalariesForEmployees([]);
      expect(map.size).toBe(0);
    });
  });

  describe('buildWhere', () => {
    it('builds an OR search clause across name/email/employeeCode', () => {
      const where = service.buildWhere({ search: 'jane' } as any);
      expect(where.OR).toHaveLength(4);
    });

    it('applies department/country/level/status filters', () => {
      const where = service.buildWhere({
        departmentId: 'dept-1',
        countryId: 'country-1',
        jobLevel: 'L3',
        status: 'ACTIVE',
      } as any);
      expect(where).toMatchObject({
        departmentId: 'dept-1',
        countryId: 'country-1',
        jobLevel: 'L3',
        employmentStatus: 'ACTIVE',
      });
    });

    it('ignores blank search strings', () => {
      const where = service.buildWhere({ search: '   ' } as any);
      expect(where.OR).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('paginates and reports accurate total/pageCount', async () => {
      for (let i = 0; i < 5; i++) {
        await createEmployee({ email: `emp${i}@acme.example` });
      }

      const page1 = await service.findAll({
        page: 1,
        pageSize: 2,
      } as any);
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.total).toBe(5);
      expect(page1.meta.pageCount).toBe(3);

      const page3 = await service.findAll({ page: 3, pageSize: 2 } as any);
      expect(page3.data).toHaveLength(1);
    });

    it('filters by jobLevel', async () => {
      await createEmployee({ email: 'l1@acme.example', jobLevel: 'L1' });
      await createEmployee({ email: 'l5@acme.example', jobLevel: 'L5' });

      const result = await service.findAll({
        jobLevel: 'L5',
        page: 1,
        pageSize: 25,
      } as any);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].jobLevel).toBe('L5');
    });

    it('attaches currentSalary to each list item', async () => {
      await createEmployee({ email: 'x@acme.example', salaryAmount: 77000 });
      const result = await service.findAll({ page: 1, pageSize: 25 } as any);
      expect(result.data[0].currentSalary?.amount).toBe(77000);
    });

    it('defaults to sorting by lastName ascending when sortBy/sortOrder are omitted', async () => {
      await service.create({
        firstName: 'Zoe',
        lastName: 'Zephyr',
        email: 'zoe@acme.example',
        departmentId,
        countryId,
        jobLevel: 'L2',
        hireDate: '2022-01-01',
        salaryAmount: 60000,
        currency: 'USD',
      });
      await service.create({
        firstName: 'Amy',
        lastName: 'Adams',
        email: 'amy@acme.example',
        departmentId,
        countryId,
        jobLevel: 'L2',
        hireDate: '2022-01-01',
        salaryAmount: 60000,
        currency: 'USD',
      });

      const result = await service.findAll({ page: 1, pageSize: 25 } as any);
      expect(result.data.map((e) => e.lastName)).toEqual(['Adams', 'Zephyr']);
    });

    it('sorts by email ascending and descending', async () => {
      await createEmployee({ email: 'b@acme.example' });
      await createEmployee({ email: 'a@acme.example' });

      const asc = await service.findAll({
        page: 1,
        pageSize: 25,
        sortBy: 'email',
        sortOrder: 'asc',
      } as any);
      expect(asc.data.map((e) => e.email)).toEqual([
        'a@acme.example',
        'b@acme.example',
      ]);

      const desc = await service.findAll({
        page: 1,
        pageSize: 25,
        sortBy: 'email',
        sortOrder: 'desc',
      } as any);
      expect(desc.data.map((e) => e.email)).toEqual([
        'b@acme.example',
        'a@acme.example',
      ]);
    });

    it('sorts by department (relation) ascending and descending', async () => {
      const deptA = await prisma.department.create({ data: { name: 'Alpha' } });
      const deptZ = await prisma.department.create({ data: { name: 'Zulu' } });

      await service.create({
        firstName: 'A',
        lastName: 'One',
        email: 'a1@acme.example',
        departmentId: deptZ.id,
        countryId,
        jobLevel: 'L2',
        hireDate: '2022-01-01',
        salaryAmount: 60000,
        currency: 'USD',
      });
      await service.create({
        firstName: 'B',
        lastName: 'Two',
        email: 'b2@acme.example',
        departmentId: deptA.id,
        countryId,
        jobLevel: 'L2',
        hireDate: '2022-01-01',
        salaryAmount: 60000,
        currency: 'USD',
      });

      const asc = await service.findAll({
        page: 1,
        pageSize: 25,
        sortBy: 'department',
        sortOrder: 'asc',
      } as any);
      expect(asc.data.map((e) => e.department.name)).toEqual([
        'Alpha',
        'Zulu',
      ]);

      const desc = await service.findAll({
        page: 1,
        pageSize: 25,
        sortBy: 'department',
        sortOrder: 'desc',
      } as any);
      expect(desc.data.map((e) => e.department.name)).toEqual([
        'Zulu',
        'Alpha',
      ]);
    });

    it('sorts by country (relation) ascending and descending', async () => {
      const countryA = await prisma.country.create({
        data: { name: 'Alderland', code: 'AL' },
      });
      const countryZ = await prisma.country.create({
        data: { name: 'Zenland', code: 'ZE' },
      });

      await service.create({
        firstName: 'A',
        lastName: 'One',
        email: 'ca1@acme.example',
        departmentId,
        countryId: countryZ.id,
        jobLevel: 'L2',
        hireDate: '2022-01-01',
        salaryAmount: 60000,
        currency: 'USD',
      });
      await service.create({
        firstName: 'B',
        lastName: 'Two',
        email: 'cb2@acme.example',
        departmentId,
        countryId: countryA.id,
        jobLevel: 'L2',
        hireDate: '2022-01-01',
        salaryAmount: 60000,
        currency: 'USD',
      });

      const asc = await service.findAll({
        page: 1,
        pageSize: 25,
        sortBy: 'country',
        sortOrder: 'asc',
      } as any);
      expect(asc.data.map((e) => e.country.name)).toEqual([
        'Alderland',
        'Zenland',
      ]);

      const desc = await service.findAll({
        page: 1,
        pageSize: 25,
        sortBy: 'country',
        sortOrder: 'desc',
      } as any);
      expect(desc.data.map((e) => e.country.name)).toEqual([
        'Zenland',
        'Alderland',
      ]);
    });
  });

  describe('create', () => {
    it('creates an employee with an initial HIRE salary record', async () => {
      const employee = await createEmployee({ email: 'new@acme.example' });
      expect(employee.currentSalary?.reason).toBe('HIRE');
      expect(employee.salaryHistory).toHaveLength(1);
      expect(employee.employeeCode).toMatch(/^EMP-\d{5}$/);
    });

    it('rejects a duplicate email', async () => {
      await createEmployee({ email: 'dup@acme.example' });
      await expect(
        createEmployee({ email: 'dup@acme.example' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an unknown departmentId', async () => {
      await expect(
        service.create({
          firstName: 'A',
          lastName: 'B',
          email: 'z@acme.example',
          departmentId: 'missing-dept',
          countryId,
          jobLevel: 'L1',
          hireDate: '2022-01-01',
          salaryAmount: 50000,
          currency: 'USD',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects setting an employee as their own manager', async () => {
      const employee = await createEmployee({ email: 'self@acme.example' });
      await expect(
        service.update(employee.id, { managerId: employee.id }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates core fields without touching salary', async () => {
      const employee = await createEmployee({ email: 'upd@acme.example' });
      const updated = await service.update(employee.id, {
        jobLevel: 'L4',
      });
      expect(updated.jobLevel).toBe('L4');
      expect(updated.currentSalary?.amount).toBe(60000);
    });
  });

  describe('addSalaryRecord', () => {
    it('appends a new record rather than overwriting the previous one', async () => {
      const employee = await createEmployee({ email: 'raise@acme.example' });
      const updated = await service.addSalaryRecord(employee.id, {
        amount: 95000,
        currency: 'USD',
        effectiveDate: '2025-01-01',
        reason: 'PROMOTION',
      });

      expect(updated.currentSalary?.amount).toBe(95000);
      expect(updated.salaryHistory).toHaveLength(2);
    });

    it('throws NotFoundException for an unknown employee', async () => {
      await expect(
        service.addSalaryRecord('missing', {
          amount: 1000,
          currency: 'USD',
          effectiveDate: '2025-01-01',
          reason: 'MERIT',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
