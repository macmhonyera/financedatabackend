import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../entities/client.entity';
import { FieldVisit } from '../../entities/field-visit.entity';
import { FieldVisitsController } from './field-visits.controller';
import { FieldVisitsService } from './field-visits.service';

@Module({
  imports: [TypeOrmModule.forFeature([FieldVisit, Client])],
  controllers: [FieldVisitsController],
  providers: [FieldVisitsService],
  exports: [FieldVisitsService],
})
export class FieldVisitsModule {}
