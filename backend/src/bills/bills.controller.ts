import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillActionDto } from './bill-action.dto';
import { BillsService } from './bills.service';

@Controller('bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Get('analytics')
  getAnalytics(@Query('date') date: string) {
    return this.billsService.getAnalytics(date);
  }

  @Get()
  getDay(@Query('date') date: string) {
    return this.billsService.getDay(date);
  }

  @Get('parcels')
  getParcels(@Query('date') date: string) {
    return this.billsService.getParcels(date);
  }

  @Post('paid')
  markPaid(@Body() dto: BillActionDto) {
    return this.billsService.markPaid(dto);
  }

  @Post('parcel')
  markParcel(@Body() dto: BillActionDto) {
    return this.billsService.markParcel(dto);
  }

  @Post('parcel-paid')
  markParcelPaid(@Body() dto: BillActionDto) {
    return this.billsService.markParcelPaid(dto);
  }

  @Post('reset')
  reset(@Body() dto: BillActionDto) {
    return this.billsService.reset(dto);
  }
}
