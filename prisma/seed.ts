import { JobLevel, SalaryChangeReason, type Prisma } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { createId } from '@paralleldrive/cuid2';
import { createPrismaClient } from './create-prisma-client';

faker.seed(42);

const prisma = createPrismaClient();

const DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Marketing',
  'Finance',
  'Human Resources',
  'Customer Support',
  'Product',
  'Operations',
];

const COUNTRIES: { name: string; code: string; currency: string }[] = [
  { name: 'United States', code: 'US', currency: 'USD' },
  { name: 'United Kingdom', code: 'GB', currency: 'GBP' },
  { name: 'Germany', code: 'DE', currency: 'EUR' },
  { name: 'France', code: 'FR', currency: 'EUR' },
  { name: 'India', code: 'IN', currency: 'INR' },
  { name: 'Canada', code: 'CA', currency: 'CAD' },
  { name: 'Australia', code: 'AU', currency: 'AUD' },
  { name: 'Spain', code: 'ES', currency: 'EUR' },
  { name: 'Brazil', code: 'BR', currency: 'BRL' },
  { name: 'Japan', code: 'JP', currency: 'JPY' },
];

// Pyramid distribution: more L1/L2 than L5/L6.
const LEVEL_WEIGHTS: { level: JobLevel; weight: number }[] = [
  { level: 'L1', weight: 30 },
  { level: 'L2', weight: 27 },
  { level: 'L3', weight: 20 },
  { level: 'L4', weight: 13 },
  { level: 'L5', weight: 7 },
  { level: 'L6', weight: 3 },
];

// Base salary bands per level, in the country's local currency, scaled by a
// per-country cost-of-living multiplier below.
const LEVEL_BASE_BAND: Record<JobLevel, [number, number]> = {
  L1: [40000, 55000],
  L2: [55000, 75000],
  L3: [75000, 100000],
  L4: [100000, 135000],
  L5: [135000, 175000],
  L6: [175000, 230000],
};

// Rough purchasing-power / currency-unit multipliers so bands look plausible
// per currency (e.g. JPY/INR nominal salaries are numerically larger).
const COUNTRY_MULTIPLIER: Record<string, number> = {
  US: 1,
  GB: 0.8,
  DE: 0.9,
  FR: 0.85,
  IN: 9, // INR nominal values are much larger
  CA: 1.05,
  AU: 1.1,
  ES: 0.75,
  BR: 4.2,
  JP: 110, // JPY nominal values are much larger
};

function pickLevel(): JobLevel {
  const totalWeight = LEVEL_WEIGHTS.reduce((sum, l) => sum + l.weight, 0);
  let roll = faker.number.int({ min: 1, max: totalWeight });
  for (const { level, weight } of LEVEL_WEIGHTS) {
    if (roll <= weight) return level;
    roll -= weight;
  }
  return 'L1';
}

function salaryForLevelAndCountry(level: JobLevel, countryCode: string): number {
  const [min, max] = LEVEL_BASE_BAND[level];
  const multiplier = COUNTRY_MULTIPLIER[countryCode] ?? 1;
  const base = faker.number.int({ min, max });
  // Round to nearest 100 (or nearest 1000 for high-multiplier currencies)
  const roundTo = multiplier >= 10 ? 1000 : 100;
  return Math.round((base * multiplier) / roundTo) * roundTo;
}

const REASON_POOL: SalaryChangeReason[] = [
  'PROMOTION',
  'MERIT',
  'MARKET_ADJUSTMENT',
  'CORRECTION',
];

/** Inserts `rows` via `createMany` in fixed-size chunks — keeps each network round-trip small and predictable regardless of how far away the database is. */
async function insertInChunks<T>(
  rows: T[],
  chunkSize: number,
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await insert(rows.slice(i, i + chunkSize));
  }
}

async function main() {
  console.log('Seeding database...');

  await prisma.salaryRecord.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.country.deleteMany();
  await prisma.department.deleteMany();

  // IDs are generated client-side (matches the schema's @default(cuid())
  // format) so the whole dataset can be built in memory first, then written
  // in a handful of batched `createMany` calls instead of one round-trip per
  // row — the difference between seconds and tens of minutes once the
  // database is remote rather than a local file.
  const departments = DEPARTMENTS.map((name) => ({ id: createId(), name }));
  const countries = COUNTRIES.map(({ name, code }) => ({ id: createId(), name, code }));

  await prisma.department.createMany({ data: departments });
  await prisma.country.createMany({ data: countries });

  const countryCurrency = new Map(COUNTRIES.map((c) => [c.code, c.currency] as const));
  const countryByCode = new Map(countries.map((c, i) => [COUNTRIES[i].code, c] as const));

  const EMPLOYEE_COUNT = 10_000;
  const managerCandidateIds: { id: string; level: JobLevel }[] = [];

  console.log(`Generating ${EMPLOYEE_COUNT} employees...`);

  const employeeRows: Prisma.EmployeeCreateManyInput[] = [];
  const salaryRecordRows: Prisma.SalaryRecordCreateManyInput[] = [];

  for (let i = 1; i <= EMPLOYEE_COUNT; i++) {
    const level = pickLevel();
    const department = faker.helpers.arrayElement(departments);
    const countryMeta = faker.helpers.arrayElement(COUNTRIES);
    const country = countryByCode.get(countryMeta.code)!;
    const currency = countryCurrency.get(countryMeta.code)!;

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const employeeCode = `EMP-${String(i).padStart(5, '0')}`;
    const email = `${firstName}.${lastName}.${i}@acme-corp.example`
      .toLowerCase()
      .replace(/[^a-z0-9.@]/g, '');

    const hireDate = faker.date.past({ years: 8 });

    // Pick a manager from a higher-level employee already generated, when
    // available, so the org hierarchy is plausible (managers appear earlier
    // in the sequence, at a higher level).
    let managerId: string | null = null;
    if (level !== 'L6' && managerCandidateIds.length > 0) {
      const higherLevelManagers = managerCandidateIds.filter((m) => m.level > level);
      if (higherLevelManagers.length > 0 && faker.datatype.boolean(0.85)) {
        managerId = faker.helpers.arrayElement(higherLevelManagers).id;
      }
    }

    const initialAmount = salaryForLevelAndCountry(level, countryMeta.code);
    const employeeId = createId();

    employeeRows.push({
      id: employeeId,
      employeeCode,
      firstName,
      lastName,
      email,
      departmentId: department.id,
      countryId: country.id,
      jobLevel: level,
      employmentStatus: faker.datatype.boolean(0.95) ? 'ACTIVE' : 'INACTIVE',
      managerId,
      hireDate,
    });

    salaryRecordRows.push({
      id: createId(),
      employeeId,
      amount: initialAmount,
      currency,
      effectiveDate: hireDate,
      reason: 'HIRE',
    });

    if (level === 'L4' || level === 'L5' || level === 'L6') {
      managerCandidateIds.push({ id: employeeId, level });
    }

    // For a meaningful subset (~20%), add extra salary-history events after
    // hire so the audit trail is visible in the demo.
    if (faker.datatype.boolean(0.2)) {
      const eventCount = faker.number.int({ min: 1, max: 3 });
      let lastAmount = initialAmount;
      let lastDate = hireDate;

      for (let e = 0; e < eventCount; e++) {
        const nextDate = faker.date.between({ from: lastDate, to: new Date() });
        if (nextDate <= lastDate) continue;

        const raisePct = faker.number.float({ min: 0.03, max: 0.18, fractionDigits: 3 });
        const roundTo = (COUNTRY_MULTIPLIER[countryMeta.code] ?? 1) >= 10 ? 1000 : 100;
        const nextAmount = Math.round((lastAmount * (1 + raisePct)) / roundTo) * roundTo;

        salaryRecordRows.push({
          id: createId(),
          employeeId,
          amount: nextAmount,
          currency,
          effectiveDate: nextDate,
          reason: faker.helpers.arrayElement(REASON_POOL),
        });

        lastAmount = nextAmount;
        lastDate = nextDate;
      }
    }

    if (i % 2000 === 0) {
      console.log(`  ...${i} employees generated`);
    }
  }

  console.log(`Writing ${employeeRows.length} employees in batches...`);
  await insertInChunks(employeeRows, 500, (chunk) =>
    prisma.employee.createMany({ data: chunk }),
  );

  console.log(`Writing ${salaryRecordRows.length} salary records in batches...`);
  await insertInChunks(salaryRecordRows, 500, (chunk) =>
    prisma.salaryRecord.createMany({ data: chunk }),
  );

  const employeeCount = await prisma.employee.count();
  const salaryRecordCount = await prisma.salaryRecord.count();
  console.log(
    `Seed complete: ${employeeCount} employees, ${salaryRecordCount} salary records.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
