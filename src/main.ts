// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ItemsSeederService } from './items/items-seeder.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const nodeEnv = (config.get<string>('NODE_ENV') ?? 'development').toLowerCase();
  const corsOriginsRaw = config.get<string>('CORS_ORIGINS') ?? '';
  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (nodeEnv === 'production') {
    if (corsOrigins.length > 0) {
      app.enableCors({ origin: corsOrigins, credentials: true });
    }
  } else {
    app.enableCors({
      origin: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5173'],
      credentials: true,
    });
  }
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  // Descomenta la siguiente línea para poblar la tabla de items con datos del GE
  // const seeder = app.get(ItemsSeederService);
  // await seeder.fetchAndFillItemsInfo();

  const swaggerEnabled =
    (config.get<string>('SWAGGER_ENABLED') ?? '').toLowerCase() === 'true' ||
    (config.get<string>('SWAGGER_ENABLED') ?? '') === '1' ||
    (nodeEnv !== 'production' &&
      (config.get<string>('SWAGGER_ENABLED') ?? '').toLowerCase() !== 'false');
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OSRS Tool API')
      .setDescription('Backend API for OSRS Tool')
      .setVersion(config.get<string>('APP_VERSION') ?? '0.0.1')
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  const portValue = config.get<string>('PORT');
  const port = portValue ? Number(portValue) : 3000;
  await app.listen(port);
}

bootstrap().catch((err) => {
  console.error('Error starting application', err);
});
