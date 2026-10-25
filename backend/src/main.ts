import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

const rootEnvPath = resolve(__dirname, '..', '..', '.env');
const rootEnv = config({ path: rootEnvPath, override: true, quiet: true });

if (rootEnv.error || !rootEnv.parsed?.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in the repository root .env file.');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: frontendOrigin.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-CSRF-Token'],
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
