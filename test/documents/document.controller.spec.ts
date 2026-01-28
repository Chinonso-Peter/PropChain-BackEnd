import { DocumentController } from '../../src/documents/document.controller';
import { DocumentAccessLevel, DocumentType } from '../../src/documents/document.model';
import { DocumentService } from '../../src/documents/document.service';

describe('DocumentController', () => {
  const createMockFile = (): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'photo.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from('image'),
      stream: null,
      destination: '',
      filename: '',
      path: '',
    }) as Express.Multer.File;

  it('parses metadata and forwards upload request', async () => {
    const service: Partial<DocumentService> = {
      uploadDocuments: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
    };
    const controller = new DocumentController(service as DocumentService);

    await controller.uploadDocuments(
      [createMockFile()],
      {
        propertyId: 'property-1',
        type: DocumentType.PHOTO,
        title: 'Front',
        tags: 'front, exterior ',
        accessLevel: DocumentAccessLevel.PUBLIC,
        allowedUserIds: 'user-1,user-2',
        allowedRoles: 'AGENT,ADMIN',
        customFields: '{"camera":"sony"}',
      },
      'user-1',
      'AGENT,ADMIN',
    );

    expect(service.uploadDocuments).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        propertyId: 'property-1',
        type: DocumentType.PHOTO,
        title: 'Front',
        tags: ['front', 'exterior'],
        accessLevel: DocumentAccessLevel.PUBLIC,
        allowedUserIds: ['user-1', 'user-2'],
        allowedRoles: ['AGENT', 'ADMIN'],
        customFields: { camera: 'sony' },
      }),
      { userId: 'user-1', roles: ['AGENT', 'ADMIN'] },
    );
  });
});
