import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './login.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username.trim().toLowerCase());
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    return {
      message: 'Login successful.',
      user: this.usersService.toPublicUser(user),
    };
  }
}
