import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Headers('x-superadmin-id') superadminId: string) {
    await this.requireSuperadmin(superadminId);
    return this.usersService.list();
  }

  @Post()
  async create(@Headers('x-superadmin-id') superadminId: string, @Body() dto: CreateUserDto) {
    await this.requireSuperadmin(superadminId);
    return this.usersService.create(dto);
  }

  @Patch(':id')
  async update(@Headers('x-superadmin-id') superadminId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    await this.requireSuperadmin(superadminId);
    return this.usersService.update(Number(id), dto);
  }

  @Delete(':id')
  async remove(@Headers('x-superadmin-id') superadminId: string, @Param('id') id: string) {
    await this.requireSuperadmin(superadminId);
    return this.usersService.remove(Number(id));
  }

  private async requireSuperadmin(superadminId: string) {
    const requester = await this.usersService.findById(Number(superadminId));
    if (!requester?.issuperadmin || !requester.isActive) {
      throw new UnauthorizedException('Superadmin access is required.');
    }
  }
}