import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('notes')
@Index('unique_user_note_date', ['userId', 'noteDate'], { unique: true })
export class Note {
  @PrimaryGeneratedColumn({ unsigned: true })
  id!: number;

  @Column({ name: 'user_id', type: 'int', unsigned: true })
  userId!: number;

  @Column({ name: 'note_date', type: 'date' })
  noteDate!: string;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}