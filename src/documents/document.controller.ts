import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  DocumentAccessContext,
  DocumentAccessLevel,
  DocumentMetadataInput,
  DocumentSearchFilters,
  DocumentType,
} from './document.model';
import { DocumentService } from './document.service';

class UploadDocumentDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;

  @IsOptional()
  @IsString()
  allowedUserIds?: string;

  @IsOptional()
  @IsString()
  allowedRoles?: string;

  @IsOptional()
  @IsString()
  customFields?: string;
}

class UpdateMetadataDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;

  @IsOptional()
  @IsString()
  allowedUserIds?: string;

  @IsOptional()
  @IsString()
  allowedRoles?: string;

  @IsOptional()
  @IsString()
  customFields?: string;
}

class DocumentQueryDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsEnum(DocumentAccessLevel)
  accessLevel?: DocumentAccessLevel;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  uploadedBy?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  createdAfter?: string;

  @IsOptional()
  @IsString()
  createdBefore?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files'))
  async uploadDocuments(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadDocumentDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const metadata = this.parseMetadataInput(body);
    return this.documentService.uploadDocuments(files, metadata, context);
  }

  @Post(':id/version')
  @UseInterceptors(FileInterceptor('file'))
  async addVersion(
    @Param('id') documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    return this.documentService.addDocumentVersion(documentId, file, context);
  }

  @Patch(':id/metadata')
  async updateMetadata(
    @Param('id') documentId: string,
    @Body() body: UpdateMetadataDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const metadata = this.parseMetadataInput(body);
    return this.documentService.updateMetadata(documentId, metadata, context);
  }

  @Get(':id')
  async getDocument(
    @Param('id') documentId: string,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    return this.documentService.getDocument(documentId, context);
  }

  @Get(':id/download')
  async downloadDocument(
    @Param('id') documentId: string,
    @Query('version') version: string | undefined,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const versionNumber = version ? Number(version) : undefined;
    if (version && Number.isNaN(versionNumber)) {
      throw new BadRequestException('Version must be a number');
    }
    return this.documentService.getDownloadUrl(documentId, versionNumber, context);
  }

  @Get()
  async listDocuments(
    @Query() query: DocumentQueryDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const filters: DocumentSearchFilters = {
      propertyId: query.propertyId,
      type: query.type,
      accessLevel: query.accessLevel,
      tag: query.tag,
      uploadedBy: query.uploadedBy,
      mimeType: query.mimeType,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
      search: query.search,
    };
    return this.documentService.listDocuments(filters, context);
  }

  private buildAccessContext(userId: string, rolesHeader?: string): DocumentAccessContext {
    return {
      userId,
      roles: this.parseCsv(rolesHeader),
    };
  }

  private parseMetadataInput(input: UploadDocumentDto | UpdateMetadataDto): DocumentMetadataInput {
    return {
      propertyId: input.propertyId,
      type: input.type,
      title: input.title,
      description: input.description,
      tags: input.tags === undefined ? undefined : this.parseCsv(input.tags),
      accessLevel: input.accessLevel,
      allowedUserIds:
        input.allowedUserIds === undefined ? undefined : this.parseCsv(input.allowedUserIds),
      allowedRoles: input.allowedRoles === undefined ? undefined : this.parseCsv(input.allowedRoles),
      customFields: input.customFields === undefined ? undefined : this.parseCustomFields(input.customFields),
    };
  }

  private parseCsv(value?: string): string[] {
    if (!value) {
      return [];
    }
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private parseCustomFields(value?: string): Record<string, string> {
    if (!value) {
      return {};
    }
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      return parsed || {};
    } catch {
      return {};
    }
  }
}
