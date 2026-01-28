export enum ApiKeyScope {
  READ_PROPERTIES = 'read:properties',
  WRITE_PROPERTIES = 'write:properties',
  READ_TRANSACTIONS = 'read:transactions',
}

export const API_KEY_SCOPES = Object.values(ApiKeyScope);
