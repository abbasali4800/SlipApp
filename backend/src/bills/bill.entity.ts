import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BillStatus = 'open' | 'paid' | 'parcel_pending' | 'parcel_paid';
export type ParcelType = 'regular' | 'sheru';

@Entity('bills')
export class Bill {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'bill_number', type: 'int' })
  billNumber!: number;

  @Column({ name: 'bill_date', type: 'date' })
  billDate!: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: BillStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount!: string | null;

  @Column({ name: 'parcel_type', type: 'varchar', length: 20, nullable: true })
  parcelType!: ParcelType | null;

  @Column({ name: 'created_by', type: 'int', unsigned: true, nullable: true })
  createdBy!: number | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'parcel_sent_at', type: 'timestamp', nullable: true })
  parcelSentAt!: Date | null;

  @Column({ name: 'parcel_paid_at', type: 'timestamp', nullable: true })
  parcelPaidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
