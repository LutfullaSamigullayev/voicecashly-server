import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      // ValidationPipe kabi holatlarda getResponse() { message: [...] } qaytaradi — saqlaymiz
      const body = typeof res === 'string' ? { statusCode: status, message: res } : res;
      return response.status(status).json(body);
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' });
  }
}
