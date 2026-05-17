import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { SystemConfigService } from './system-config.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

@ApiTags('system-config')
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly svc: SystemConfigService) {}

  @Get('company-profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current organization profile/branding for the signed-in user' })
  @ApiResponse({ status: 200, description: 'Organization profile' })
  companyProfile(@Req() req: any) {
    return this.svc.getCompanyProfile(req.user);
  }

  @Patch('company-profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization profile/branding (admin/manager)' })
  @ApiResponse({ status: 200, description: 'Organization profile updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateCompanyProfile(@Req() req: any, @Body() dto: UpdateCompanyProfileDto) {
    return this.svc.updateCompanyProfile(req.user, dto);
  }

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

  @Get('settings')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get operational system settings (penalties, approvals, etc.)' })
  @ApiResponse({ status: 200, description: 'System settings' })
  getSettings(@Req() req: any) {
    return this.svc.getSystemSettings(req.user);
  }

  @Patch('settings')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update operational system settings (admin only)' })
  @ApiResponse({ status: 200, description: 'Updated system settings' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateSettings(@Req() req: any, @Body() dto: UpdateSystemSettingsDto) {
    return this.svc.updateSystemSettings(req.user, dto);
  }

  @Get('report-catalog')
  @ApiOperation({ summary: 'List available report definitions' })
  @ApiResponse({ status: 200, description: 'Report catalog' })
  reportCatalog() {
    return this.svc.getReportCatalog();
  }
}
