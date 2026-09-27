import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from './note.entity';
import { SaveNoteDto } from './save-note.dto';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
  ) {}

  async getByDate(noteDate: string, userId: number) {
    this.validateDate(noteDate);
    this.validateUser(userId);
    const note = await this.notesRepository.findOne({ where: { noteDate, userId } });
    return note ?? { id: null, userId, noteDate, content: '' };
  }

  async save(dto: SaveNoteDto) {
    this.validateDate(dto.noteDate);
    this.validateUser(Number(dto.userId));
    const userId = Number(dto.userId);
    const content = String(dto.content ?? '');
    const existing = await this.notesRepository.findOne({ where: { noteDate: dto.noteDate, userId } });
    const note = existing
      ? this.notesRepository.merge(existing, { content })
      : this.notesRepository.create({ userId, noteDate: dto.noteDate, content });

    return this.notesRepository.save(note);
  }

  private validateDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
      throw new BadRequestException('Note date must be in YYYY-MM-DD format.');
    }
  }

  private validateUser(value: number) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException('Valid user id is required.');
    }
  }
}