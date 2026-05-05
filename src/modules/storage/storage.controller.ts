import {
  All,
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { LocalFsStorageProvider } from '../../common/storage/local-fs.storage';
import { STORAGE_PROVIDER } from '../../common/storage/storage.types';
import type { StorageProvider } from '../../common/storage/storage.types';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('storage')
@Controller('storage')
export class StorageController {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly localFs: LocalFsStorageProvider,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Post('upload-url')
  @ApiOperation({
    summary: 'Get a short-lived presigned upload URL',
    description:
      'Returns where to PUT a file. The mobile client uploads directly to `uploadUrl` with the given headers, ' +
      'then submits the resulting `storageKey` to the resource creation endpoint (e.g. document upload).',
  })
  presignUpload(@Body() body: PresignUploadDto) {
    return this.storage.presignUpload(body);
  }

  // Local-FS adapter routes — these would be replaced by S3 PUT/GET in production.
  @All('files/:scope/:date/:name')
  async handleFile(
    @Req() req: Request,
    @Res() res: Response,
    @Param('scope') scope: string,
    @Param('date') date: string,
    @Param('name') name: string,
    @Query('expires') expires?: string,
    @Query('sig') sig?: string,
  ) {
    const storageKey = `${scope}/${date}/${name}`;

    if (req.method === 'PUT') {
      const expiresNum = Number(expires || 0);
      if (!sig || !this.localFs.verifyUploadSignature(storageKey, expiresNum, String(sig))) {
        throw new ForbiddenException('Invalid or expired upload signature');
      }
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve());
        req.on('error', (err) => reject(err));
      });
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) {
        throw new BadRequestException('Empty upload body');
      }
      await this.localFs.writeUploadedFile(storageKey, buf);
      res.status(201).json({ storageKey, sizeBytes: buf.length });
      return;
    }

    if (req.method === 'GET') {
      try {
        const data = await this.localFs.readFile(storageKey);
        res.status(200).end(data);
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          res.status(404).json({ message: 'Not found' });
          return;
        }
        throw err;
      }
      return;
    }

    res.status(405).json({ message: 'Method not allowed' });
  }
}
