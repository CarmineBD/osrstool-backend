import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { Quest } from '../catalogs/entities/quest.entity';
import { ItemsModule } from '../items/items.module';
import { Item } from '../items/entities/item.entity';
import { MethodProfitRefresherModule } from '../method-profit-refresher/method-profit-refresher.module';
import { Method } from '../methods/entities/method.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminScriptExecution } from './entities/admin-script-execution.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminScriptExecution, User, Item, Quest, Method, MethodVariant]),
    AuthModule,
    ItemsModule,
    MethodProfitRefresherModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
