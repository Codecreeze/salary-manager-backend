import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Lookups & Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.salaryRecord.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.country.deleteMany();
    await prisma.department.deleteMany();
  });

  it('GET /departments returns seeded departments sorted by name', async () => {
    await prisma.department.createMany({
      data: [{ name: 'Sales' }, { name: 'Engineering' }],
    });

    const res = await request(app.getHttpServer())
      .get('/departments')
      .expect(200);

    expect(res.body.map((d: any) => d.name)).toEqual([
      'Engineering',
      'Sales',
    ]);
  });

  it('GET /countries returns seeded countries', async () => {
    await prisma.country.create({ data: { name: 'United States', code: 'US' } });

    const res = await request(app.getHttpServer())
      .get('/countries')
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBe('US');
  });

  it('GET /analytics/summary reflects seeded employees', async () => {
    const department = await prisma.department.create({
      data: { name: 'Engineering' },
    });
    const country = await prisma.country.create({
      data: { name: 'United States', code: 'US' },
    });
    await prisma.employee.create({
      data: {
        employeeCode: 'EMP-00001',
        firstName: 'A',
        lastName: 'B',
        email: 'ab@acme.example',
        departmentId: department.id,
        countryId: country.id,
        jobLevel: 'L1',
        hireDate: new Date('2022-01-01'),
        salaryRecords: {
          create: {
            amount: 55000,
            currency: 'USD',
            effectiveDate: new Date('2022-01-01'),
            reason: 'HIRE',
          },
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get('/analytics/summary')
      .expect(200);

    expect(res.body.headcount).toBe(1);
    expect(res.body.payrollByCurrency[0].totalPayroll).toBe(55000);
  });

  it('GET /analytics/distribution returns bucketed histogram data', async () => {
    const res = await request(app.getHttpServer())
      .get('/analytics/distribution')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});
