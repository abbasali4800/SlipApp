import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Bill } from './bill.entity';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [TypeOrmModule.forFeature([Bill, User])],
  controllers: [BillsController],
  providers: [BillsService],
})
export class BillsModule {}
