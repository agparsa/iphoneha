import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [DiscountsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
