import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let prisma: PrismaService;
  let service: AnalyticsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    service = new AnalyticsService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.salaryRecord.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.country.deleteMany();
    await prisma.department.deleteMany();
  });

  async function seedEmployee(opts: {
    departmentName: string;
    countryName: string;
    countryCode: string;
    jobLevel: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';
    amount: number;
    currency: string;
    status?: 'ACTIVE' | 'INACTIVE';
    email: string;
  }) {
    const department = await prisma.department.upsert({
      where: { name: opts.departmentName },
      create: { name: opts.departmentName },
      update: {},
    });
    const country = await prisma.country.upsert({
      where: { code: opts.countryCode },
      create: { name: opts.countryName, code: opts.countryCode },
      update: {},
    });

    const employee = await prisma.employee.create({
      data: {
        employeeCode: `EMP-${Math.random().toString(36).slice(2, 8)}`,
        firstName: 'Test',
        lastName: 'Employee',
        email: opts.email,
        departmentId: department.id,
        countryId: country.id,
        jobLevel: opts.jobLevel,
        employmentStatus: opts.status ?? 'ACTIVE',
        hireDate: new Date('2022-01-01'),
        salaryRecords: {
          create: {
            amount: opts.amount,
            currency: opts.currency,
            effectiveDate: new Date('2022-01-01'),
            reason: 'HIRE',
          },
        },
      },
    });

    return employee;
  }

  it('getSummary reports headcount and payroll broken down by currency', async () => {
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L2',
      amount: 100000,
      currency: 'USD',
      email: 'a@acme.example',
    });
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L3',
      amount: 120000,
      currency: 'USD',
      email: 'b@acme.example',
    });
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'Germany',
      countryCode: 'DE',
      jobLevel: 'L2',
      amount: 80000,
      currency: 'EUR',
      email: 'c@acme.example',
    });

    const summary = await service.getSummary();
    expect(summary.headcount).toBe(3);

    const usd = summary.payrollByCurrency.find((p) => p.currency === 'USD');
    expect(usd?.headcount).toBe(2);
    expect(usd?.totalPayroll).toBe(220000);
    expect(usd?.averagePayroll).toBe(110000);

    const eur = summary.payrollByCurrency.find((p) => p.currency === 'EUR');
    expect(eur?.headcount).toBe(1);
    expect(eur?.totalPayroll).toBe(80000);
  });

  it('excludes INACTIVE employees from analytics', async () => {
    await seedEmployee({
      departmentName: 'Sales',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L1',
      amount: 50000,
      currency: 'USD',
      status: 'INACTIVE',
      email: 'inactive@acme.example',
    });

    const summary = await service.getSummary();
    expect(summary.headcount).toBe(0);
  });

  it('getByDepartment computes correct average and median per department/currency', async () => {
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L1',
      amount: 50000,
      currency: 'USD',
      email: 'e1@acme.example',
    });
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L2',
      amount: 70000,
      currency: 'USD',
      email: 'e2@acme.example',
    });
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L3',
      amount: 90000,
      currency: 'USD',
      email: 'e3@acme.example',
    });

    const [engineering] = await service.getByDepartment();
    expect(engineering.name).toBe('Engineering');
    expect(engineering.headcount).toBe(3);
    expect(engineering.averageSalary).toBe(70000);
    expect(engineering.medianSalary).toBe(70000);
  });

  it('getByLevel groups by job level and currency separately', async () => {
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L1',
      amount: 40000,
      currency: 'USD',
      email: 'l1-us@acme.example',
    });
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'Germany',
      countryCode: 'DE',
      jobLevel: 'L1',
      amount: 35000,
      currency: 'EUR',
      email: 'l1-de@acme.example',
    });

    const byLevel = await service.getByLevel();
    const groups = byLevel.filter((g) => g.id === 'L1');
    expect(groups).toHaveLength(2);
  });

  it('getDistribution buckets salaries into fixed-width ranges per currency', async () => {
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L1',
      amount: 45000,
      currency: 'USD',
      email: 'd1@acme.example',
    });
    await seedEmployee({
      departmentName: 'Engineering',
      countryName: 'United States',
      countryCode: 'US',
      jobLevel: 'L1',
      amount: 52000,
      currency: 'USD',
      email: 'd2@acme.example',
    });

    const distribution = await service.getDistribution();
    const usd = distribution.find((d) => d.currency === 'USD');
    expect(usd?.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(2);
  });
});
