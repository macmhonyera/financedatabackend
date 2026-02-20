import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { CreditScore } from './credit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CreditScore])],
  providers: [CreditService],
  controllers: [CreditController],
  exports: [CreditService],
})
export class CreditModule {}
