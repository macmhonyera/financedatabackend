import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../entities/client.entity';
import { CreditScoreResult } from './scoring.entity';
import { ScoringController } from './scoring.controller';
import { ScoringModelService } from './scoring.model';
import { ScoringService } from './scoring.service';

@Module({
  imports: [TypeOrmModule.forFeature([CreditScoreResult, Client])],
  controllers: [ScoringController],
  providers: [ScoringModelService, ScoringService],
  exports: [ScoringModelService, ScoringService],
})
export class CreditScoreModule {}
