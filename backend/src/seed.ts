import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './users/users.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  const admin = await usersService.findByUsername('admin');
  if (!admin) {
    await usersService.create({
      name: 'System Superadmin',
      username: 'admin',
      password: 'admin123',
      issuperadmin: true,
      isActive: true,
    });
    console.log('✅ Created default superadmin user (username: admin, password: admin123)');
  } else {
    console.log('ℹ️ Superadmin user already exists.');
  }

  await app.close();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
