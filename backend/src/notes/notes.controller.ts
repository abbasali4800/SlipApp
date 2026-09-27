import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { SaveNoteDto } from './save-note.dto';

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  getByDate(@Query('date') date: string, @Query('userId') userId: string) {
    return this.notesService.getByDate(date, Number(userId));
  }

  @Post()
  save(@Body() dto: SaveNoteDto) {
    return this.notesService.save(dto);
  }
}