import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { UpdateLoanProductDto } from './dto/update-loan-product.dto';
import { LoanProductsService } from './loan-products.service';

@ApiTags('loan-products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('loan-products')
export class LoanProductsController {
  constructor(private svc: LoanProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List loan products' })
  @ApiResponse({ status: 200, description: 'Loan products list' })
  list(@Query('includeInactive') includeInactive?: string) {
    const resolved = includeInactive !== 'false';
    return this.svc.findAll(resolved);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan product by ID' })
  @ApiResponse({ status: 200, description: 'Loan product found' })
  get(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Post()
  @ApiOperation({ summary: 'Create loan product (admin/manager)' })
  @ApiResponse({ status: 201, description: 'Loan product created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Body() dto: CreateLoanProductDto) {
    return this.svc.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Patch(':id')
  @ApiOperation({ summary: 'Update loan product (admin/manager)' })
  @ApiResponse({ status: 200, description: 'Loan product updated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(@Param('id') id: string, @Body() dto: UpdateLoanProductDto) {
    return this.svc.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate loan product (admin/manager)' })
  @ApiResponse({ status: 200, description: 'Loan product deactivated' })
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }
}
