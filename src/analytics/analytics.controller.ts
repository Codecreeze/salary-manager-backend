import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary() {
    return this.analyticsService.getSummary();
  }

  @Get('by-department')
  getByDepartment() {
    return this.analyticsService.getByDepartment();
  }

  @Get('by-country')
  getByCountry() {
    return this.analyticsService.getByCountry();
  }

  @Get('by-level')
  getByLevel() {
    return this.analyticsService.getByLevel();
  }

  @Get('distribution')
  getDistribution() {
    return this.analyticsService.getDistribution();
  }
}
