import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllDepartments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  findAllCountries() {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }
}
