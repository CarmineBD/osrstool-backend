// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Permite peticiones desde tu frontend en dev
  app.enableCors({
    origin: 'http://localhost:5173',
    // o para cualquier origen en DEV, simplemente:
    // origin: true,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
