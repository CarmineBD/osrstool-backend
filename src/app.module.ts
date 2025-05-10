import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MethodsModule } from './methods/methods.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MethodsModule],
})
export class AppModule {}
