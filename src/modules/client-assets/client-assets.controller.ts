import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ClientAssetsService } from './client-assets.service';
import { CreateClientAssetDto } from './dto/create-client-asset.dto';
import { UpdateClientAssetDto } from './dto/update-client-asset.dto';

@ApiTags('client-assets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'manager', 'loan_officer')
@Controller('clients/:clientId/assets')
export class ClientAssetsController {
  constructor(private readonly svc: ClientAssetsService) {}

  @Get()
  @ApiOperation({ summary: 'List assets for a client' })
  @ApiResponse({ status: 200, description: 'Client assets list' })
  list(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.svc.listForClient(clientId, req.user, includeInactive !== 'false');
  }

  @Post()
  @ApiOperation({ summary: 'Add an asset for a client' })
  @ApiResponse({ status: 201, description: 'Asset created' })
  create(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: CreateClientAssetDto) {
    return this.svc.createForClient(clientId, dto, req.user);
  }

  @Patch(':assetId')
  @ApiOperation({ summary: 'Update a client asset market value/details' })
  @ApiResponse({ status: 200, description: 'Asset updated' })
  update(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateClientAssetDto,
  ) {
    return this.svc.updateForClient(clientId, assetId, dto, req.user);
  }
}
