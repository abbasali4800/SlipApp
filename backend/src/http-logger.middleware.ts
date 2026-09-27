import { Injectable, Logger, NestMiddleware } from '@nestjs/common';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: any, res: any, next: () => void): void {
    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const statusIcon = statusCode >= 400 ? '❌' : '✅';
      this.logger.log(`${statusIcon} [${method}] ${originalUrl} -> ${statusCode} (${duration}ms) - IP: ${ip || 'unknown'}`);
    });

    next();
  }
}
