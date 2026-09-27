import { Injectable, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findByUsername(username: string) {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findById(id: number) {
    if (!Number.isFinite(id)) return null;
    return this.usersRepository.findOne({ where: { id } });
  }

  async list() {
    const users = await this.usersRepository.find({ order: { id: 'ASC' } });
    return users.map((user) => this.toPublicUser(user));
  }

  async create(dto: CreateUserDto) {
    if (!dto.name || !dto.username || !dto.password) {
      throw new BadRequestException('Name, username, and password are required.');
    }

    const username = dto.username.trim().toLowerCase();
    const existing = await this.findByUsername(username);
    if (existing) throw new ConflictException('Username already exists.');

    const user = this.usersRepository.create({
      name: dto.name.trim(),
      username,
      passwordHash: await bcrypt.hash(dto.password, 10),
      issuperadmin: Boolean(dto.issuperadmin),
      isActive: dto.isActive === undefined ? true : Boolean(dto.isActive),
    });

    return this.toPublicUser(await this.usersRepository.save(user));
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found.');

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required.');
      user.name = dto.name.trim();
    }

    if (dto.username !== undefined) {
      const username = dto.username.trim().toLowerCase();
      if (!username) throw new BadRequestException('Username is required.');
      const existing = await this.findByUsername(username);
      if (existing && existing.id !== id) throw new ConflictException('Username already exists.');
      user.username = username;
    }

    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.issuperadmin !== undefined) user.issuperadmin = Boolean(dto.issuperadmin);
    if (dto.isActive !== undefined) user.isActive = Boolean(dto.isActive);

    return this.toPublicUser(await this.usersRepository.save(user));
  }

  async remove(id: number) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    await this.usersRepository.remove(user);
    return { success: true };
  }

  toPublicUser(user: User) {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      issuperadmin: Boolean(user.issuperadmin),
      isActive: Boolean(user.isActive),
    };
  }
}