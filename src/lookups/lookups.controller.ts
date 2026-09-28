import { Controller, Get } from '@nestjs/common';
import { LookupsService } from './lookups.service';

@Controller()
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('departments')
  findAllDepartments() {
    return this.lookupsService.findAllDepartments();
  }

  @Get('countries')
  findAllCountries() {
    return this.lookupsService.findAllCountries();
  }
}
