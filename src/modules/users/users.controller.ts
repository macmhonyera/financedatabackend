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
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto, UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  async me(@Req() req: any) {
    const user = await this.svc.findById(req.user?.sub || req.user?.id);
    return this.svc.sanitize(user);
  }

  @Get()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List all staff (admin/manager)' })
  async list() {
    const users = await this.svc.all();
    return users.map((u) => this.svc.sanitize(u));
  }

  @Get(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get a staff member by id (admin/manager)' })
  async findOne(@Param('id') id: string) {
    const user = await this.svc.findById(id);
    return this.svc.sanitize(user);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a staff account (admin only)' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async create(@Body() body: CreateUserDto) {
    const user = await this.svc.createWithPlainPassword(body);
    return this.svc.sanitize(user);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a staff account (admin only)' })
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    const user = await this.svc.update(id, body);
    return this.svc.sanitize(user);
  }

  @Patch(':id/password')
  @Roles('admin')
  @ApiOperation({ summary: 'Reset a user password (admin only)' })
  resetPassword(@Param('id') id: string, @Body() body: ChangePasswordDto) {
    return this.svc.setPassword(id, body.password);
  }

  @Patch(':id/deactivate')
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate a user (admin only)' })
  async deactivate(@Param('id') id: string) {
    const user = await this.svc.setActive(id, false);
    return this.svc.sanitize(user);
  }

  @Patch(':id/activate')
  @Roles('admin')
  @ApiOperation({ summary: 'Re-activate a user (admin only)' })
  async activate(@Param('id') id: string) {
    const user = await this.svc.setActive(id, true);
    return this.svc.sanitize(user);
  }
}
