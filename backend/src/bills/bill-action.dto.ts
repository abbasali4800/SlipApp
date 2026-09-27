export class BillActionDto {
  billNumber!: number;
  billDate!: string;
  amount?: number;
  parcelType?: 'regular' | 'sheru';
  userId?: number;
}
