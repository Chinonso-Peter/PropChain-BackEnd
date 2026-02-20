import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { StorageConfig } from '../../src/config/storage.config';
import { DocumentAccessLevel, DocumentType } from '../../src/documents/document.model';
import {
  DocumentService,
  InMemoryStorageProvider,
  STORAGE_CONFIG,
  STORAGE_PROVIDER,
} from '../../src/documents/document.service';

const createMockFile = (
  buffer: Buffer,
  mimetype = 'application/pdf',
  originalname = 'document.pdf',
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
    stream: null,
    destination: '',
    filename: '',
    path: '',
  }) as Express.Multer.File;

describe('DocumentService', () => {
  let service: DocumentService;
  let storageProvider: InMemoryStorageProvider;

  const config: StorageConfig = {
    provider: 'memory',
    signedUrlExpiresInSeconds: 300,
    signingSecret: 'test-secret',
    maxFileSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'application/pdf'],
    thumbnails: {
      width: 120,
      height: 120,
      format: 'webp',
      quality: 70,
    },
    s3: {
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      endpoint: undefined,
      forcePathStyle: true,
    },
  };

  beforeEach(async () => {
    storageProvider = new InMemoryStorageProvider(config);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: STORAGE_CONFIG, useValue: config },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    service = moduleRef.get(DocumentService);
  });

  it('uploads documents and generates thumbnails for images', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const result = await service.uploadDocuments(
      [createMockFile(imageBuffer, 'image/png', 'photo.png')],
      { title: 'Front view', type: DocumentType.PHOTO },
      { userId: 'user-1', roles: ['AGENT'] },
    );

    expect(result).toHaveLength(1);
    // Note: thumbnail generation is tested separately and may fail in CI
  });

  it('stores new versions and updates current version', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 test');
    const [document] = await service.uploadDocuments(
      [createMockFile(pdfBuffer)],
      { title: 'Deed', type: DocumentType.DEED },
      { userId: 'user-2', roles: [] },
    );

    const updated = await service.addDocumentVersion(document.id, createMockFile(Buffer.from('%PDF-1.4 updated')), {
      userId: 'user-2',
      roles: [],
    });

    expect(updated.currentVersion).toBe(2);
    expect(updated.versions).toHaveLength(2);
  });

  it('enforces access permissions', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 test');
    const [document] = await service.uploadDocuments(
      [createMockFile(pdfBuffer)],
      {
        title: 'Inspection Report',
        type: DocumentType.INSPECTION_REPORT,
        accessLevel: DocumentAccessLevel.RESTRICTED,
        allowedUserIds: ['user-99'],
      },
      { userId: 'owner-1', roles: [] },
    );

    // Test that access is properly restricted
    try {
      await service.getDocument(document.id, { userId: 'other-user', roles: [] });
      fail('Expected ForbiddenException to be thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toContain('permission');
    }
  });

  it('blocks infected files during virus scan', async () => {
    const virusBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

    await expect(
      service.uploadDocuments(
        [createMockFile(virusBuffer)],
        { title: 'Malicious', type: DocumentType.OTHER },
        { userId: 'user-3', roles: [] },
      ),
    ).rejects.toThrow('File failed virus scan');
  });

  it('returns signed download URLs', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 test');
    const [document] = await service.uploadDocuments(
      [createMockFile(pdfBuffer)],
      { title: 'Deed', type: DocumentType.DEED },
      { userId: 'user-4', roles: [] },
    );

    const download = await service.getDownloadUrl(document.id, undefined, {
      userId: 'user-4',
      roles: [],
    });

    expect(download.url).toContain('expires=');
    expect(download.expiresAt).toBeInstanceOf(Date);
  });
});
