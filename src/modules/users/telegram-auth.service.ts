import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class TelegramAuthService {
  verify(data: Record<string, string>): boolean {
    const { hash, ...rest } = data;

    const checkString = Object.keys(rest)
      .sort()
      .map(k => `${k}=${rest[k]}`)
      .join('\n');

    const secretKey = crypto
      .createHash('sha256')
      .update(process.env.BOT_TOKEN!)
      .digest();

    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    const isExpired = Date.now() / 1000 - parseInt(rest.auth_date) > 3600;
    return hmac === hash && !isExpired;
  }
}
