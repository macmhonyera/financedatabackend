import { Module } from '@nestjs/common';
import { StorageModule as StorageInfraModule } from '../../common/storage/storage.module';
import { StorageController } from './storage.controller';

@Module({
  imports: [StorageInfraModule],
  controllers: [StorageController],
})
export class StorageHttpModule {}
