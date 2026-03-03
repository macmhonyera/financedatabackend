import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../../entities/client.entity';
import { ClientAsset } from '../../entities/client-asset.entity';
import { ClientAssetsController } from './client-assets.controller';
import { ClientAssetsService } from './client-assets.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClientAsset, Client])],
  controllers: [ClientAssetsController],
  providers: [ClientAssetsService],
  exports: [ClientAssetsService],
})
export class ClientAssetsModule {}
