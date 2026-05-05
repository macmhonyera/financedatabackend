import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';
import { FieldVisitsService } from './field-visits.service';

@ApiTags('field-visits')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('field-visits')
export class FieldVisitsController {
  constructor(private readonly svc: FieldVisitsService) {}

  @Post()
  @Roles('loan_officer', 'manager', 'collector', 'admin')
  @ApiOperation({ summary: 'Record a field visit (loan officer / manager / collector / admin)' })
  create(@Req() req: any, @Body() body: CreateFieldVisitDto) {
    return this.svc.create(body, req.user);
  }

  @Get('client/:clientId')
  @Roles('loan_officer', 'manager', 'collector', 'admin')
  @ApiOperation({ summary: 'List visits for a specific client' })
  listForClient(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.listForClient(clientId, req.user);
  }

  @Get('mine')
  @Roles('loan_officer', 'manager', 'collector', 'admin')
  @ApiOperation({ summary: 'List my recent field visits' })
  listMine(@Req() req: any, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    return this.svc.listMine(req.user, Number.isFinite(parsed) ? Number(parsed) : 200);
  }
}
