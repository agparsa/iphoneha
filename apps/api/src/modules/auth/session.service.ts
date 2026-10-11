import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Response } from 'express';
import type { SessionDto } from '@iphoneha/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infra/redis/redis.constants';
import { ADMIN_SESSION_COOKIE, USER_SESSION_COOKIE } from '../../common/cookies';
import { clearCookie, randomToken, setCookie, sha256, type ClientInfo } from '../../common/utils';
import type { AuthAdmin, AuthUser } from '../../types/express';

type Kind = 'USER' | 'ADMIN';

interface CachedSession {
  sessionId: string;
  kind: Kind;
  subjectId: string;
  phone: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string;
  role?: AuthAdmin['role'];
  isActive: boolean;
  expiresAt: number;
}

const CACHE_TTL_SECONDS = 30;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private cacheKey(tokenHash: string): string {
    return `sess:${tokenHash}`;
  }

  private subjectKey(kind: Kind, subjectId: string): string {
    return `sess:subject:${kind}:${subjectId}`;
  }

  /** Creates a session row and returns the raw cookie token (only ever seen here). */
  async create(
    kind: Kind,
    subjectId: string,
    client: ClientInfo,
  ): Promise<{ token: string; sessionId: string }> {
    const token = randomToken(32);
    const tokenHash = sha256(token);
    const ttlMs = kind === 'ADMIN' ? this.config.adminSessionTtlMs : this.config.sessionTtlMs;
    const session = await this.prisma.session.create({
      data: {
        kind,
        tokenHash,
        userId: kind === 'USER' ? subjectId : null,
        adminUserId: kind === 'ADMIN' ? subjectId : null,
        ip: client.ip,
        userAgent: client.userAgent,
        deviceName: client.deviceName,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    await this.redis.sadd(this.subjectKey(kind, subjectId), tokenHash);
    return { token, sessionId: session.id };
  }

  attachCookie(res: Response, kind: Kind, token: string): void {
    setCookie(res, kind === 'ADMIN' ? ADMIN_SESSION_COOKIE : USER_SESSION_COOKIE, token, {
      secure: this.config.COOKIE_SECURE,
      maxAgeMs: kind === 'ADMIN' ? this.config.adminSessionTtlMs : this.config.sessionTtlMs,
    });
  }

  clearCookie(res: Response, kind: Kind): void {
    clearCookie(
      res,
      kind === 'ADMIN' ? ADMIN_SESSION_COOKIE : USER_SESSION_COOKIE,
      this.config.COOKIE_SECURE,
    );
  }

  async resolveUser(token: string): Promise<{ user: AuthUser; sessionId: string } | null> {
    const cached = await this.resolve(token, 'USER');
    if (!cached) return null;
    return {
      sessionId: cached.sessionId,
      user: {
        id: cached.subjectId,
        phone: cached.phone,
        firstName: cached.firstName ?? null,
        lastName: cached.lastName ?? null,
        isActive: cached.isActive,
      },
    };
  }

  async resolveAdmin(token: string): Promise<{ admin: AuthAdmin; sessionId: string } | null> {
    const cached = await this.resolve(token, 'ADMIN');
    if (!cached || !cached.role) return null;
    return {
      sessionId: cached.sessionId,
      admin: {
        id: cached.subjectId,
        phone: cached.phone,
        name: cached.name ?? '',
        role: cached.role,
        isActive: cached.isActive,
      },
    };
  }

  private async resolve(token: string, kind: Kind): Promise<CachedSession | null> {
    if (!token) return null;
    const tokenHash = sha256(token);
    const key = this.cacheKey(tokenHash);

    const raw = await this.redis.get(key);
    if (raw) {
      const cached = JSON.parse(raw) as CachedSession;
      if (cached.kind === kind && cached.expiresAt > Date.now() && cached.isActive) {
        void this.touch(cached.sessionId);
        return cached;
      }
      return null;
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true, adminUser: true },
    });
    if (!session || session.kind !== kind) return null;
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

    let payload: CachedSession | null = null;
    if (kind === 'USER' && session.user) {
      if (!session.user.isActive) return null;
      payload = {
        sessionId: session.id,
        kind,
        subjectId: session.user.id,
        phone: session.user.phone,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        isActive: session.user.isActive,
        expiresAt: session.expiresAt.getTime(),
      };
    } else if (kind === 'ADMIN' && session.adminUser) {
      if (!session.adminUser.isActive) return null;
      payload = {
        sessionId: session.id,
        kind,
        subjectId: session.adminUser.id,
        phone: session.adminUser.phone,
        name: session.adminUser.name,
        role: session.adminUser.role,
        isActive: session.adminUser.isActive,
        expiresAt: session.expiresAt.getTime(),
      };
    }
    if (!payload) return null;

    await this.redis.set(key, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);
    await this.redis.sadd(this.subjectKey(kind, payload.subjectId), tokenHash);
    void this.touch(session.id, session.lastSeenAt);
    return payload;
  }

  private async touch(sessionId: string, lastSeenAt?: Date): Promise<void> {
    if (lastSeenAt && Date.now() - lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return;
    const marker = `sess:touch:${sessionId}`;
    const fresh = await this.redis.set(marker, '1', 'EX', TOUCH_INTERVAL_MS / 1000, 'NX');
    if (fresh !== 'OK') return;
    await this.prisma.session
      .updateMany({ where: { id: sessionId, revokedAt: null }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(this.cacheKey(session.tokenHash));
    const subjectId = session.userId ?? session.adminUserId;
    if (subjectId) await this.redis.srem(this.subjectKey(session.kind as Kind, subjectId), session.tokenHash);
  }

  /** Revokes every session of a subject (used when blocking a user or changing a role). */
  async revokeAllForSubject(kind: Kind, subjectId: string, exceptSessionId?: string): Promise<number> {
    const sessions = await this.prisma.session.findMany({
      where: {
        kind,
        ...(kind === 'USER' ? { userId: subjectId } : { adminUserId: subjectId }),
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true, tokenHash: true },
    });
    if (!sessions.length) return 0;
    await this.prisma.session.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(...sessions.map((s) => this.cacheKey(s.tokenHash)));
    await this.redis.del(this.subjectKey(kind, subjectId));
    return sessions.length;
  }

  async list(kind: Kind, subjectId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        kind,
        ...(kind === 'USER' ? { userId: subjectId } : { adminUserId: subjectId }),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      deviceName: s.deviceName,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }));
  }

  /** Housekeeping: drop sessions that expired more than a day ago. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    return result.count;
  }
}
