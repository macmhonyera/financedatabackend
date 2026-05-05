import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { SyncQueryDto } from './dto/sync-query.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly svc: SyncService) {}

  @Get('loan-officer')
  @Roles('loan_officer', 'manager', 'collector', 'admin')
  @ApiOperation({
    summary: 'Pull branch-scoped deltas for the loan officer mobile app.',
    description:
      'Returns clients, loans, installments, payments, payment promises and recovery actions ' +
      'updated after the `since` cursor. Sorted ASC by updatedAt; cap of `limit` rows per entity ' +
      '(default 500, max 1000). Use the `syncedAt` field of the response as the next `since`. ' +
      '`hasMore` is true if any entity hit the cap — call again immediately with the new cursor.',
  })
  @ApiQuery({ name: 'since', required: false, description: 'ISO timestamp; omit for initial sync' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max rows per entity (1-1000)' })
  loanOfficerDelta(@Req() req: any, @Query() query: SyncQueryDto) {
    return this.svc.loanOfficerDelta(req.user, query.since, query.limit);
  }
}
