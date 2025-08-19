// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ItemsSeederService } from './items/items-seeder.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Permite peticiones desde tu frontend en dev
  app.enableCors({
    origin: 'http://localhost:5173',
    // o para cualquier origen en DEV, simplemente:
    // origin: true,
  });

  // Descomenta la siguiente línea para poblar la tabla de items con datos del GE
  // const seeder = app.get(ItemsSeederService);
  // await seeder.fetchAndFillItemsInfo();

  await app.listen(process.env.PORT || 3000);
}

bootstrap().catch((err) => {
  console.error('Error starting application', err);
});
