import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Bill, BillStatus } from './bill.entity';
import { BillActionDto } from './bill-action.dto';

const MAX_BILL_NUMBER = 250;

@Injectable()
export class BillsService {
  constructor(
    @InjectRepository(Bill)
    private readonly billsRepository: Repository<Bill>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async getDay(billDate: string) {
    this.validateDate(billDate);
    const savedBills = await this.billsRepository.find({ where: { billDate }, order: { billNumber: 'ASC' } });
    
    // Fetch users for editor lookup
    const userIds = Array.from(new Set(savedBills.map((b) => b.createdBy).filter(Boolean))) as number[];
    const users = userIds.length ? await this.usersRepository.findByIds(userIds) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const byNumber = new Map(savedBills.map((bill) => [bill.billNumber, this.toResponse(bill, userMap.get(bill.createdBy!))]));

    return Array.from({ length: MAX_BILL_NUMBER }, (_, index) => {
      const billNumber = index + 1;
      return byNumber.get(billNumber) ?? this.emptyBill(billNumber, billDate);
    });
  }

  async getParcels(billDate: string) {
    this.validateDate(billDate);
    const bills = await this.billsRepository.find({
      where: [{ billDate, status: 'parcel_pending' }, { billDate, status: 'parcel_paid' }],
      order: { billNumber: 'ASC' },
    });
    return bills.map((bill) => this.toResponse(bill));
  }

  async markPaid(dto: BillActionDto) {
    const bill = await this.getOrCreate(dto);
    bill.status = 'paid';
    bill.paidAt = new Date();
    bill.parcelPaidAt = null;
    bill.parcelSentAt = null;
    bill.amount = null;
    bill.parcelType = null;
    bill.createdBy = dto.userId ?? bill.createdBy;
    const saved = await this.billsRepository.save(bill);
    const user = saved.createdBy ? await this.usersRepository.findOne({ where: { id: saved.createdBy } }) : null;
    return this.toResponse(saved, user ?? undefined);
  }

  async markParcel(dto: BillActionDto) {
    if (!dto.amount || Number(dto.amount) <= 0) {
      throw new BadRequestException('Parcel amount is required.');
    }

    const bill = await this.getOrCreate(dto);
    bill.status = 'parcel_pending';
    bill.amount = Number(dto.amount).toFixed(2);
    bill.parcelType = dto.parcelType === 'sheru' ? 'sheru' : 'regular';
    bill.parcelSentAt = new Date();
    bill.paidAt = null;
    bill.parcelPaidAt = null;
    bill.createdBy = dto.userId ?? bill.createdBy;
    const saved = await this.billsRepository.save(bill);
    const user = saved.createdBy ? await this.usersRepository.findOne({ where: { id: saved.createdBy } }) : null;
    return this.toResponse(saved, user ?? undefined);
  }

  async markParcelPaid(dto: BillActionDto) {
    const bill = await this.findExisting(dto);
    if (!bill || !['parcel_pending', 'parcel_paid'].includes(bill.status)) {
      throw new NotFoundException('Parcel bill not found.');
    }

    bill.status = 'parcel_paid';
    bill.parcelPaidAt = new Date();
    bill.createdBy = dto.userId ?? bill.createdBy;
    const saved = await this.billsRepository.save(bill);
    const user = saved.createdBy ? await this.usersRepository.findOne({ where: { id: saved.createdBy } }) : null;
    return this.toResponse(saved, user ?? undefined);
  }

  async reset(dto: BillActionDto) {
    const bill = await this.findExisting(dto);
    if (!bill) {
      return this.emptyBill(dto.billNumber, dto.billDate);
    }

    await this.billsRepository.remove(bill);
    return this.emptyBill(dto.billNumber, dto.billDate);
  }

  private async getOrCreate(dto: BillActionDto) {
    this.validateDto(dto);
    const existing = await this.findExisting(dto);
    if (existing) {
      return existing;
    }

    return this.billsRepository.create({
      billNumber: dto.billNumber,
      billDate: dto.billDate,
      status: 'open',
      createdBy: dto.userId ?? null,
    });
  }

  private findExisting(dto: BillActionDto) {
    this.validateDto(dto);
    return this.billsRepository.findOne({ where: { billNumber: dto.billNumber, billDate: dto.billDate } });
  }

  private validateDto(dto: BillActionDto) {
    this.validateDate(dto.billDate);
    if (!Number.isInteger(dto.billNumber) || dto.billNumber < 1 || dto.billNumber > MAX_BILL_NUMBER) {
      throw new BadRequestException(`Bill number must be between 1 and ${MAX_BILL_NUMBER}.`);
    }
  }

  async getAnalytics(date: string) {
    this.validateDate(date);

    const targetDate = new Date(date);
    const dayBills = await this.billsRepository.find({ where: { billDate: date } });

    const completedCount = dayBills.filter((b) => b.status === 'paid' || b.status === 'parcel_paid').length;
    
    // Unique users who edited/handled slips today
    const uniqueUsersSet = new Set(dayBills.map((b) => b.createdBy).filter(Boolean));
    const usersEditedCount = uniqueUsersSet.size;

    // Parcel counts
    const parcelBills = dayBills.filter((b) => b.status === 'parcel_pending' || b.status === 'parcel_paid');
    const commParcelBills = parcelBills.filter((b) => b.parcelType === 'sheru');
    const normalParcelCount = parcelBills.length - commParcelBills.length;

    // Comm parcel total & 8% commission
    const commTotal = commParcelBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const commCommission = commTotal * 0.08;

    // All database bills for graphs & comparisons
    const allBills = await this.billsRepository.find();

    // Helper to count completed in date range or exact date
    const countCompletedOnDate = (dStr: string) =>
      allBills.filter((b) => b.billDate === dStr && (b.status === 'paid' || b.status === 'parcel_paid')).length;

    // Date math helpers
    const getOffsetDateStr = (days: number) => {
      const d = new Date(targetDate);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const getOffsetYearDateStr = (years: number) => {
      const d = new Date(targetDate);
      d.setFullYear(d.getFullYear() + years);
      return d.toISOString().slice(0, 10);
    };

    // 1. Hourly graph for targetDate
    const hourlyMap: Record<number, number> = { 8: 0, 10: 0, 12: 0, 14: 0, 16: 0, 18: 0, 20: 0 };
    dayBills.forEach((b) => {
      if ((b.status === 'paid' || b.status === 'parcel_paid') && b.paidAt) {
        const hour = new Date(b.paidAt).getHours();
        const closestHour = Object.keys(hourlyMap).map(Number).reduce((prev, curr) =>
          Math.abs(curr - hour) < Math.abs(prev - hour) ? curr : prev
        );
        hourlyMap[closestHour] = (hourlyMap[closestHour] || 0) + 1;
      }
    });

    const hourlyGraph = [
      { label: '8 AM', val: String(hourlyMap[8] || 0), height: Math.min(100, Math.max(15, (hourlyMap[8] || 0) * 10)) },
      { label: '10 AM', val: String(hourlyMap[10] || 0), height: Math.min(100, Math.max(15, (hourlyMap[10] || 0) * 10)) },
      { label: '12 PM', val: String(hourlyMap[12] || 0), height: Math.min(100, Math.max(15, (hourlyMap[12] || 0) * 10)) },
      { label: '2 PM', val: String(hourlyMap[14] || 0), height: Math.min(100, Math.max(15, (hourlyMap[14] || 0) * 10)) },
      { label: '4 PM', val: String(hourlyMap[16] || 0), height: Math.min(100, Math.max(15, (hourlyMap[16] || 0) * 10)) },
      { label: '6 PM', val: String(hourlyMap[18] || 0), height: Math.min(100, Math.max(15, (hourlyMap[18] || 0) * 10)) },
    ];

    // 2. Comparisons
    const thisMondayStr = getOffsetDateStr(-((targetDate.getDay() + 6) % 7));
    const lastMondayStr = getOffsetDateStr(-((targetDate.getDay() + 6) % 7) - 7);
    const thisMondayCount = countCompletedOnDate(thisMondayStr);
    const lastMondayCount = countCompletedOnDate(lastMondayStr);

    const calcBadge = (curr: number, prev: number) => {
      if (prev === 0) return { badge: curr > 0 ? '+100%' : '0%', positive: true };
      const pct = (((curr - prev) / prev) * 100).toFixed(1);
      return { badge: `${pct >= '0' ? '+' : ''}${pct}%`, positive: curr >= prev };
    };

    const comparisons = [
      {
        key: 'monday',
        title: 'This Monday vs Last Week Monday',
        current: `${thisMondayCount} slips`,
        previous: `${lastMondayCount} slips`,
        ...calcBadge(thisMondayCount, lastMondayCount),
      },
      {
        key: 'week',
        title: 'This Week vs Last Week',
        current: `${completedCount} slips`,
        previous: `${lastMondayCount} slips`,
        ...calcBadge(completedCount, lastMondayCount),
      },
      {
        key: 'month',
        title: 'This Month vs Last Month',
        current: `${completedCount} slips`,
        previous: `${countCompletedOnDate(getOffsetDateStr(-30))} slips`,
        ...calcBadge(completedCount, countCompletedOnDate(getOffsetDateStr(-30))),
      },
      {
        key: 'month_ly',
        title: 'This Month vs Last Year Same Month',
        current: `${completedCount} slips`,
        previous: `${countCompletedOnDate(getOffsetYearDateStr(-1))} slips`,
        ...calcBadge(completedCount, countCompletedOnDate(getOffsetYearDateStr(-1))),
      },
      {
        key: 'year_today',
        title: 'This Year Today vs Last Year Today',
        current: `${completedCount} slips`,
        previous: `${countCompletedOnDate(getOffsetYearDateStr(-1))} slips`,
        ...calcBadge(completedCount, countCompletedOnDate(getOffsetYearDateStr(-1))),
      },
    ];

    const userIds = Array.from(uniqueUsersSet) as number[];
    const activeUsers = userIds.length ? await this.usersRepository.findByIds(userIds) : [];
    const activeEditors = activeUsers.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.issuperadmin ? 'Superadmin' : 'Admin / Cashier',
      editedSlipsCount: dayBills.filter((b) => b.createdBy === u.id).length,
    }));

    // Compute Weekly days (Mon to Sun of current week)
    const monDate = new Date(targetDate);
    monDate.setDate(monDate.getDate() - ((targetDate.getDay() + 6) % 7));

    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, idx) => {
      const d = new Date(monDate);
      d.setDate(d.getDate() + idx);
      const dStr = d.toISOString().slice(0, 10);
      const val = countCompletedOnDate(dStr);
      return { label, val: String(val), count: val };
    });
    const maxWeekly = Math.max(...daysOfWeek.map((d) => d.count), 1);
    const weeklyGraph = daysOfWeek.map((d) => ({
      label: d.label,
      val: String(d.count),
      height: d.count === 0 ? 0 : Math.min(100, Math.max(15, Math.round((d.count / maxWeekly) * 100))),
    }));

    // Compute Monthly (Week 1: Days 1-7, Week 2: Days 8-14, Week 3: Days 15-21, Week 4: Days 22-End)
    const yearNum = targetDate.getFullYear();
    const monthNum = targetDate.getMonth(); // 0-indexed
    const completedBillsThisMonth = allBills.filter((b) => {
      if (b.status !== 'paid' && b.status !== 'parcel_paid') return false;
      const bd = new Date(b.billDate);
      return bd.getFullYear() === yearNum && bd.getMonth() === monthNum;
    });

    const w1 = completedBillsThisMonth.filter((b) => new Date(b.billDate).getDate() <= 7).length;
    const w2 = completedBillsThisMonth.filter((b) => { const d = new Date(b.billDate).getDate(); return d >= 8 && d <= 14; }).length;
    const w3 = completedBillsThisMonth.filter((b) => { const d = new Date(b.billDate).getDate(); return d >= 15 && d <= 21; }).length;
    const w4 = completedBillsThisMonth.filter((b) => new Date(b.billDate).getDate() >= 22).length;

    const maxMonthly = Math.max(w1, w2, w3, w4, 1);
    const monthlyGraph = [
      { label: 'Week 1', val: String(w1), height: w1 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((w1 / maxMonthly) * 100))) },
      { label: 'Week 2', val: String(w2), height: w2 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((w2 / maxMonthly) * 100))) },
      { label: 'Week 3', val: String(w3), height: w3 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((w3 / maxMonthly) * 100))) },
      { label: 'Week 4', val: String(w4), height: w4 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((w4 / maxMonthly) * 100))) },
    ];

    // Compute Yearly (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
    const completedBillsThisYear = allBills.filter((b) => {
      if (b.status !== 'paid' && b.status !== 'parcel_paid') return false;
      return new Date(b.billDate).getFullYear() === yearNum;
    });

    const q1 = completedBillsThisYear.filter((b) => new Date(b.billDate).getMonth() <= 2).length;
    const q2 = completedBillsThisYear.filter((b) => { const m = new Date(b.billDate).getMonth(); return m >= 3 && m <= 5; }).length;
    const q3 = completedBillsThisYear.filter((b) => { const m = new Date(b.billDate).getMonth(); return m >= 6 && m <= 8; }).length;
    const q4 = completedBillsThisYear.filter((b) => new Date(b.billDate).getMonth() >= 9).length;

    const maxYearly = Math.max(q1, q2, q3, q4, 1);
    const yearlyGraph = [
      { label: 'Q1', val: String(q1), height: q1 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((q1 / maxYearly) * 100))) },
      { label: 'Q2', val: String(q2), height: q2 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((q2 / maxYearly) * 100))) },
      { label: 'Q3', val: String(q3), height: q3 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((q3 / maxYearly) * 100))) },
      { label: 'Q4', val: String(q4), height: q4 === 0 ? 0 : Math.min(100, Math.max(15, Math.round((q4 / maxYearly) * 100))) },
    ];

    return {
      kpis: {
        slipsCompleted: completedCount,
        totalSlips: MAX_BILL_NUMBER,
        usersEditedCount,
        totalParcelCount: parcelBills.length,
        commParcelCount: commParcelBills.length,
        normalParcelCount,
        commTotal,
        commCommission,
        activeEditors,
      },
      graphs: {
        weekly: weeklyGraph,
        monthly: monthlyGraph,
        yearly: yearlyGraph,
      },
      comparisons,
    };
  }

  private validateDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Bill date must be in YYYY-MM-DD format.');
    }
  }

  private emptyBill(billNumber: number, billDate: string) {
    return {
      id: null,
      billNumber,
      billDate,
      status: 'open' as BillStatus,
      amount: null,
      parcelType: null,
      paidAt: null,
      parcelSentAt: null,
      parcelPaidAt: null,
    };
  }

  private toResponse(bill: Bill, editor?: User) {
    return {
      id: bill.id,
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      status: bill.status,
      amount: bill.amount === null ? null : Number(bill.amount),
      parcelType: bill.parcelType,
      paidAt: bill.paidAt,
      parcelSentAt: bill.parcelSentAt,
      parcelPaidAt: bill.parcelPaidAt,
      updatedAt: bill.updatedAt,
      editor: editor ? {
        id: editor.id,
        name: editor.name,
        username: editor.username,
        role: editor.issuperadmin ? 'Superadmin' : 'Admin / Cashier',
      } : null,
    };
  }
}

