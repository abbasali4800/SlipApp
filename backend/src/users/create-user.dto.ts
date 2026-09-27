export class CreateUserDto {
  name!: string;
  username!: string;
  password!: string;
  issuperadmin?: boolean;
  isActive?: boolean;
}
