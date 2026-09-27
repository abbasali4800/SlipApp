export class LoginDto {
  username!: string;
  password!: string;
  loginType!: 'user' | 'superadmin';
}
