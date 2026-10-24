/*
 * ===========================================
 * 文件存储控制器
 * ===========================================
 */

import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService, UploadResult } from './storage.service';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    return this.storageService.uploadFile(file, 'images');
  }

  @Post('video')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/^video\/(mp4|webm|quicktime)$/)) {
          return callback(
            new BadRequestException('Only video files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    return this.storageService.uploadFile(file, 'videos');
  }

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    const folder = file.mimetype.startsWith('image/')
      ? 'images'
      : file.mimetype.startsWith('video/')
        ? 'videos'
        : 'files';
    return this.storageService.uploadFile(file, folder);
  }

  @Delete(':key(*)')
  async deleteFile(@Param('key') key: string): Promise<{ success: boolean }> {
    await this.storageService.deleteFile(key);
    return { success: true };
  }

  @Get('url/:key(*)')
  async getUrl(@Param('key') key: string): Promise<{ url: string }> {
    return { url: this.storageService.getUrl(key) };
  }
}
