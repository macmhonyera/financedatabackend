import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ComplianceService } from './compliance.service';
import { UpsertKycDto } from './dto/upsert-kyc.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';
import { CreateAmlEventDto } from './dto/create-aml-event.dto';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('compliance')
export class ComplianceController {
  constructor(private svc: ComplianceService) {}

  @Post('kyc/:clientId')
  @ApiOperation({ summary: 'Create or update KYC profile for a client' })
  @ApiResponse({ status: 201, description: 'KYC upserted' })
  upsertKyc(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: UpsertKycDto) {
    return this.svc.upsertKyc(clientId, dto, req.user);
  }

  @Get('kyc/:clientId')
  @ApiOperation({ summary: 'Get KYC profile by client ID' })
  getKyc(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getKycByClient(clientId, req.user);
  }

  @Post('complaints')
  @ApiOperation({ summary: 'Log a consumer complaint' })
  createComplaint(@Req() req: any, @Body() dto: CreateComplaintDto) {
    return this.svc.createComplaint(dto, req.user);
  }

  @Get('complaints')
  @ApiOperation({ summary: 'List complaints' })
  listComplaints(@Req() req: any, @Query('status') status?: any) {
    return this.svc.listComplaints(req.user, status);
  }

  @Patch('complaints/:id/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update complaint status (admin/manager)' })
  updateComplaintStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateComplaintStatusDto) {
    return this.svc.updateComplaintStatus(id, dto, req.user);
  }

  @Post('aml-events')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create AML/CFT event (admin/manager)' })
  createAmlEvent(@Req() req: any, @Body() dto: CreateAmlEventDto) {
    return this.svc.createAmlEvent(dto, req.user);
  }

  @Get('aml-events')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List AML/CFT events (admin/manager)' })
  listAmlEvents(@Req() req: any, @Query('status') status?: string) {
    return this.svc.listAmlEvents(req.user, status);
  }

  @Get('metrics/regulatory')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Regulatory/portfolio metrics snapshot' })
  metrics(@Req() req: any) {
    return this.svc.regulatoryMetrics(req.user);
  }

  @Get('audit')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Recent audit log entries' })
  audit(@Req() req: any, @Query('limit') limit?: string) {
    return this.svc.recentAuditLogs(req.user, limit ? Number(limit) : 50);
  }
}
