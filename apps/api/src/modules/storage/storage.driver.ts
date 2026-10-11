export interface StoredObject {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/** Pluggable object storage (local disk in development, S3/MinIO in production). */
export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  read(key: string): Promise<Buffer | null>;
}
