import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return this.health();
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'restaurant-cash-backend',
    };
  }
}

