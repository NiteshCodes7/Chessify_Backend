import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';

function validateEnv() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_WS_SECRET',
    'FRONTEND_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing env variables: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        origin.endsWith('.vercel.app') ||
        origin === process.env.FRONTEND_URL ||
        origin === 'http://localhost:3000'
      ) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });
  await app.listen(process.env.PORT || 3001);
  console.log(`Server running on ${process.env.PORT}`);
}
bootstrap().catch((err) => {
  console.log('Bootstrap error: ', err);
  process.exit(1);
});
