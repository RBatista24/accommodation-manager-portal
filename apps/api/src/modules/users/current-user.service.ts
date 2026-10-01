import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Phase 1 has no login. Manual actions are attributed to one configured owner
 * user so the audit log is meaningful. When authentication arrives, this is
 * the single place that changes: it will return the authenticated user.
 */
@Injectable()
export class CurrentUserService {
  private cachedId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async id(): Promise<string> {
    if (this.cachedId) return this.cachedId;
    const { name, email } = this.config.defaultUser;
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email },
      select: { id: true },
    });
    this.cachedId = user.id;
    return user.id;
  }
}
