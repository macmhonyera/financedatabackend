import { PartialType } from '@nestjs/swagger';
import { CreateClientAssetDto } from './create-client-asset.dto';

export class UpdateClientAssetDto extends PartialType(CreateClientAssetDto) {}
