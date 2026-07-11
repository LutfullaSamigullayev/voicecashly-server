import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TelegramAuthService } from './telegram-auth.service';
import { BotAuthService } from './bot-auth.service';

@Module({
  imports: [
    // registerAsync: secret ConfigModule .env'ni yuklab bo'lgach o'qiladi.
    // Oddiy register() bilan dekorator import vaqtida ishlab, lokalda .env'dagi
    // JWT_SECRET o'rniga fallback ishlatilib ketardi.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  providers: [UsersService, TelegramAuthService, BotAuthService],
  controllers: [UsersController],
  exports: [UsersService, JwtModule, BotAuthService],
})
export class UsersModule {}
