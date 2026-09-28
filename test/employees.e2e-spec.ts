import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Employees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let departmentId: string;
  let countryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
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

    const department = await prisma.department.create({
      data: { name: 'Engineering' },
    });
    const country = await prisma.country.create({
      data: { name: 'United States', code: 'US' },
    });
    departmentId = department.id;
    countryId = country.id;
  });

  const basePayload = () => ({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@acme.example',
    departmentId,
    countryId,
    jobLevel: 'L3',
    hireDate: '2022-01-01',
    salaryAmount: 90000,
    currency: 'USD',
  });

  describe('GET /employees', () => {
    it('returns paginated employees', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/employees?page=1&pageSize=25')
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].currentSalary.amount).toBe(90000);
    });

    it('rejects an out-of-range pageSize', async () => {
      await request(app.getHttpServer())
        .get('/employees?pageSize=1000')
        .expect(400);
    });
  });

  describe('POST /employees', () => {
    it('creates an employee with an initial HIRE salary record', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      expect(res.body.currentSalary.reason).toBe('HIRE');
      expect(res.body.employeeCode).toMatch(/^EMP-\d{5}$/);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees')
        .send({})
        .expect(400);

      expect(res.body.message).toEqual(expect.any(Array));
    });

    it('returns 409 for a duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(409);
    });
  });

  describe('GET /employees/:id', () => {
    it('returns employee detail with salary history', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/employees/${created.body.id}`)
        .expect(200);

      expect(res.body.salaryHistory).toHaveLength(1);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .get('/employees/does-not-exist')
        .expect(404);
    });
  });

  describe('PATCH /employees/:id', () => {
    it('updates core fields', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/employees/${created.body.id}`)
        .send({ jobLevel: 'L4' })
        .expect(200);

      expect(res.body.jobLevel).toBe('L4');
    });
  });

  describe('POST /employees/:id/salary', () => {
    it('appends a salary record and updates currentSalary', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/employees/${created.body.id}/salary`)
        .send({
          amount: 110000,
          currency: 'USD',
          effectiveDate: '2025-01-01',
          reason: 'PROMOTION',
        })
        .expect(201);

      expect(res.body.currentSalary.amount).toBe(110000);
      expect(res.body.salaryHistory).toHaveLength(2);
    });

    it('validates the reason enum', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send(basePayload())
        .expect(201);

      await request(app.getHttpServer())
        .post(`/employees/${created.body.id}/salary`)
        .send({
          amount: 110000,
          currency: 'USD',
          effectiveDate: '2025-01-01',
          reason: 'NOT_A_REASON',
        })
        .expect(400);
    });
  });
});
