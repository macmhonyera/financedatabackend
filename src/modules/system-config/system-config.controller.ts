import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemConfigService } from './system-config.service';

@ApiTags('system-config')
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly svc: SystemConfigService) {}

  @Get('payment-channels')
  @ApiOperation({ summary: 'List supported payment channels' })
  @ApiResponse({ status: 200, description: 'Payment channels' })
  paymentChannels() {
    return this.svc.getPaymentChannels();
  }

  @Get('currencies')
  @ApiOperation({ summary: 'List supported currencies' })
  @ApiResponse({ status: 200, description: 'Currencies' })
  currencies() {
    return this.svc.getSupportedCurrencies();
  }

  @Get('report-catalog')
  @ApiOperation({ summary: 'List available report definitions' })
  @ApiResponse({ status: 200, description: 'Report catalog' })
  reportCatalog() {
    return this.svc.getReportCatalog();
  }
}
