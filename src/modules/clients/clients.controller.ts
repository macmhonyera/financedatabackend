import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateClientDto } from './dto/create-client.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { UploadClientDocumentDto } from './dto/upload-client-document.dto';
import { UploadClientProfilePhotoDto } from './dto/upload-client-profile-photo.dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clients')
export class ClientsController {
  constructor(private svc: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clients' })
  @ApiResponse({ status: 200, description: 'List of clients' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Req() req: any) {
    return this.svc.findAllScoped(req.user);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List uploaded client documents' })
  @ApiResponse({ status: 200, description: 'Client document list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  documents(@Req() req: any, @Param('id') id: string) {
    return this.svc.listDocumentsScoped(id, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client by ID' })
  @ApiResponse({ status: 200, description: 'Client found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.svc.findByIdScoped(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer')
  @Post()
  @ApiOperation({ summary: 'Create a client (admin/manager/loan_officer)' })
  @ApiResponse({ status: 201, description: 'Client created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Req() req: any, @Body() body: CreateClientDto) {
    const payload: any = {
      name: body.name,
      phone: body.phone,
      email: body.email,
      idNumber: body.idNumber,
      avatar: body.avatar,
      creditScore: body.creditScore,
      status: body.status,
      collectionStatus: body.collectionStatus,
      loanOfficer: body.loanOfficer || req.user?.name,
      businessType: body.businessType,
      registrationNumber: body.registrationNumber,
      monthlyIncome: body.monthlyIncome,
      employmentType: body.employmentType,
    };

    if (req.user?.role === 'admin' && body.branchId) {
      payload.branch = { id: body.branchId };
    } else if (req.user?.branch) {
      payload.branch = { id: req.user.branch };
    }
    return this.svc.create(payload);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer')
  @Post(':id/profile-photo')
  @ApiOperation({ summary: 'Upload/update client profile photo' })
  @ApiResponse({ status: 201, description: 'Profile photo uploaded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  uploadProfilePhoto(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UploadClientProfilePhotoDto,
  ) {
    return this.svc.updateProfilePhotoScoped(id, body.dataUrl, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer')
  @Post(':id/documents')
  @ApiOperation({ summary: 'Upload a client document' })
  @ApiResponse({ status: 201, description: 'Document uploaded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  uploadDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UploadClientDocumentDto,
  ) {
    return this.svc.uploadDocumentScoped(id, body, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer')
  @Put(':id')
  @ApiOperation({ summary: 'Update a client (admin/manager/loan_officer)' })
  @ApiResponse({ status: 200, description: 'Client updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(@Req() req: any, @Param('id') id: string, @Body() body: Partial<CreateClientDto>) {
    const payload: any = { ...body };
    if (payload.branchId) {
      payload.branch = { id: payload.branchId };
      delete payload.branchId;
    }
    return this.svc.updateScoped(id, payload as any, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'loan_officer')
  @Delete(':id/documents/:documentId')
  @ApiOperation({ summary: 'Delete a client document' })
  @ApiResponse({ status: 200, description: 'Document deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  deleteDocument(@Req() req: any, @Param('id') id: string, @Param('documentId') documentId: string) {
    return this.svc.deleteDocumentScoped(id, documentId, req.user);
  }
}
