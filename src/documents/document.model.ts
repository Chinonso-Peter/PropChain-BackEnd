export enum DocumentType {
  DEED = 'DEED',
  INSPECTION_REPORT = 'INSPECTION_REPORT',
  PHOTO = 'PHOTO',
  OTHER = 'OTHER',
}

export enum DocumentAccessLevel {
  PRIVATE = 'PRIVATE',
  RESTRICTED = 'RESTRICTED',
  PUBLIC = 'PUBLIC',
}

export enum DocumentStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface DocumentMetadata {
  propertyId?: string;
  title: string;
  description?: string;
  tags: string[];
  uploadedBy: string;
  accessLevel: DocumentAccessLevel;
  allowedUserIds: string[];
  allowedRoles: string[];
  customFields: Record<string, string>;
}

export interface DocumentVersion {
  version: number;
  storageKey: string;
  checksum: string;
  size: number;
  mimeType: string;
  createdAt: Date;
  uploadedBy: string;
  originalFileName: string;
  thumbnailKey?: string;
}

export interface DocumentRecord {
  id: string;
  type: DocumentType;
  metadata: DocumentMetadata;
  versions: DocumentVersion[];
  currentVersion: number;
  status: DocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentSearchFilters {
  propertyId?: string;
  type?: DocumentType;
  accessLevel?: DocumentAccessLevel;
  tag?: string;
  uploadedBy?: string;
  mimeType?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
}

export interface DocumentAccessContext {
  userId: string;
  roles: string[];
}

export interface DocumentMetadataInput {
  propertyId?: string;
  type?: DocumentType;
  title?: string;
  description?: string;
  tags?: string[];
  accessLevel?: DocumentAccessLevel;
  allowedUserIds?: string[];
  allowedRoles?: string[];
  customFields?: Record<string, string>;
  uploadedBy?: string;
}
