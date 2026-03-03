import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly svc: BranchesService) {}

  @Get('public')
  @ApiOperation({ summary: 'List active branches for pre-login flows' })
  @ApiResponse({ status: 200, description: 'Branches list' })
  listPublic() {
    return this.svc.listActive();
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List branches (scoped)' })
  @ApiResponse({ status: 200, description: 'Branches list' })
  listScoped(@Req() req: any) {
    return this.svc.listScoped(req.user);
  }
}
