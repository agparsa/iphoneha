import { Global, Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './admin-auth.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [UsersModule, CartModule],
  controllers: [AuthController, AdminAuthController],
  providers: [AuthService, OtpService, SessionService],
  exports: [SessionService, OtpService, AuthService],
})
export class AuthModule {}
