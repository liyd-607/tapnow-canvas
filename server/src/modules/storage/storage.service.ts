/*
 * ===========================================
 * 文件存储服务
 * 支持: 本地存储 / 阿里云OSS / AWS S3 / MinIO
 * ===========================================
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(file: Buffer, key: string, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

@Injectable()
export class StorageService {
  private provider: StorageProvider;
  private uploadDir: string;

  constructor(private configService: ConfigService) {
    const storageType = this.configService.get<string>('STORAGE_TYPE') || 'local';
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR') || './uploads';

    switch (storageType) {
      case 'oss':
        this.provider = new OssProvider(this.configService);
        break;
      case 's3':
        this.provider = new S3Provider(this.configService);
        break;
      default:
        this.provider = new LocalProvider(this.configService, this.uploadDir);
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
  ): Promise<UploadResult> {
    const ext = file.originalname.split('.').pop() || '';
    const key = `${folder}/${uuidv4()}.${ext}`;
    const url = await this.provider.upload(file.buffer, key, file.mimetype);

    return {
      url,
      key,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    folder: string = 'uploads',
  ): Promise<UploadResult> {
    const ext = filename.split('.').pop() || '';
    const key = `${folder}/${uuidv4()}.${ext}`;
    const url = await this.provider.upload(buffer, key, mimeType);

    return {
      url,
      key,
      size: buffer.length,
      mimeType,
    };
  }

  async deleteFile(key: string): Promise<void> {
    await this.provider.delete(key);
  }

  getUrl(key: string): string {
    return this.provider.getUrl(key);
  }
}

// ===========================================
// 本地存储提供者
// ===========================================

class LocalProvider implements StorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor(
    private configService: ConfigService,
    uploadDir: string,
  ) {
    this.uploadDir = uploadDir;
    // 确保目录存在
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
    const publicUrl =
      this.configService.get<string>('SERVER_PUBLIC_URL') || 'http://localhost:3001';
    this.baseUrl = `${publicUrl}/media`;
  }

  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    const filePath = join(this.uploadDir, key);
    const dir = join(this.uploadDir, key.split('/').slice(0, -1).join('/'));

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.write(file);
      stream.end();
      stream.on('finish', () => resolve(`${this.baseUrl}/${key}`));
      stream.on('error', reject);
    });
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.uploadDir, key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

// ===========================================
// 阿里云 OSS 提供者
// ===========================================

class OssProvider implements StorageProvider {
  private endpoint: string;
  private bucket: string;
  private cdnUrl?: string;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>('OSS_ENDPOINT', '');
    this.bucket = this.configService.get<string>('OSS_BUCKET', '');
    this.cdnUrl = this.configService.get<string>('OSS_CDN_URL');
  }

  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    // 动态导入 ali-oss
    const OSS = require('ali-oss');
    const client = new OSS({
      region: this.configService.get<string>('OSS_REGION'),
      accessKeyId: this.configService.get<string>('OSS_ACCESS_KEY'),
      accessKeySecret: this.configService.get<string>('OSS_SECRET_KEY'),
      bucket: this.bucket,
    });

    const result = await client.put(key, file, {
      headers: { 'Content-Type': mimeType },
    });

    return this.cdnUrl ? `${this.cdnUrl}/${key}` : result.url;
  }

  async delete(key: string): Promise<void> {
    const OSS = require('ali-oss');
    const client = new OSS({
      region: this.configService.get<string>('OSS_REGION'),
      accessKeyId: this.configService.get<string>('OSS_ACCESS_KEY'),
      accessKeySecret: this.configService.get<string>('OSS_SECRET_KEY'),
      bucket: this.bucket,
    });

    await client.delete(key);
  }

  getUrl(key: string): string {
    return this.cdnUrl ? `${this.cdnUrl}/${key}` : `https://${this.bucket}.${this.endpoint}/${key}`;
  }
}

// ===========================================
// AWS S3 / MinIO 提供者
// ===========================================

class S3Provider implements StorageProvider {
  private endpoint: string;
  private bucket: string;
  private useSSL: boolean;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>('S3_ENDPOINT', 'localhost:9000');
    this.bucket = this.configService.get<string>('S3_BUCKET', 'tapnow-canvas');
    this.useSSL = this.configService.get<boolean>('S3_USE_SSL', false);
  }

  async upload(
    file: Buffer,
    key: string,
    mimeType: string,
  ): Promise<string> {
    const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: `${this.useSSL ? 'https' : 'http'}://${this.endpoint}`,
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY'),
      },
      forcePathStyle: true, // MinIO 需要
    });

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
      }),
    );

    return `${this.useSSL ? 'https' : 'http'}://${this.endpoint}/${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: `${this.useSSL ? 'https' : 'http'}://${this.endpoint}`,
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY'),
      },
      forcePathStyle: true,
    });

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  getUrl(key: string): string {
    return `${this.useSSL ? 'https' : 'http'}://${this.endpoint}/${this.bucket}/${key}`;
  }
}
