// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ItemsSeederService } from './items/items-seeder.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Permite peticiones desde tu frontend en dev
  app.enableCors({
    origin: 'http://localhost:5173',
    // o para cualquier origen en DEV, simplemente:
    // origin: true,
  });

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OSRS Tool API')
    .setDescription('Backend API for OSRS Tool')
    .setVersion(process.env.APP_VERSION ?? '0.0.1')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT || 3000);
}

bootstrap().catch((err) => {
  console.error('Error starting application', err);
});
