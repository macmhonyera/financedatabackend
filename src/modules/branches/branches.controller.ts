import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BranchesService } from './branches.service';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

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
  @ApiOperation({ summary: 'List branches (scoped to user)' })
  @ApiResponse({ status: 200, description: 'Branches list' })
  listScoped(@Req() req: any) {
    return this.svc.listScoped(req.user);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get a branch by id (admin/manager)' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create a branch (admin only)' })
  @ApiResponse({ status: 201, description: 'Branch created' })
  @ApiResponse({ status: 409, description: 'Branch id already exists' })
  create(@Body() body: CreateBranchDto) {
    return this.svc.create(body);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Update a branch (admin only)' })
  update(@Param('id') id: string, @Body() body: UpdateBranchDto) {
    return this.svc.update(id, body);
  }

  @Patch(':id/deactivate')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate a branch (admin only)' })
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }
}
