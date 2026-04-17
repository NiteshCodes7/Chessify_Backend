import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadAvatar(
    file: { buffer: Buffer; mimetype: string },
    userId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: 'Chessify-Avatars',
          public_id: `avatar_${userId}`,
          overwrite: true,
          transformation: [
            { width: 200, height: 200, crop: 'fill', gravity: 'face' },
          ],
        },
        (error, result) => {
          if (error || !result) return reject(new Error('Upload failed'));
          resolve(result.secure_url);
        },
      );
      Readable.from(file.buffer).pipe(upload);
    });
  }

  async deleteAvatar(userId: string): Promise<void> {
    await cloudinary.uploader.destroy(`Chessify-Avatars/avatar_${userId}`);
  }
}
