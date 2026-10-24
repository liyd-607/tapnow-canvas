import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        tapies: true,
        role: true,
        createdAt: true,
      },
    });
  }

  updateProfile(id: string, data: { nickname?: string; avatar?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        tapies: true,
        role: true,
      },
    });
  }
}
