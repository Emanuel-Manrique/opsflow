import type { TenantRequest } from '../../common/tenant/tenant-request.types';
import { Body, Controller, Delete, Get, HttpCode, NotFoundException } from '@nestjs/common';
import { Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn } from 'class-validator';
import type { Request, Response } from 'express';
import type { Role, SessionDto } from '@opsflow/contracts';
import { DEMO_USERS } from '@opsflow/contracts';
import { SessionRepository } from '@opsflow/persistence';
import { assertSameOriginMutation, SESSION_COOKIE, sessionToken } from '../../common/tenant/session-cookie';

class DemoSessionDto {
  @IsIn(['admin', 'operator', 'viewer'])
  role!: Role;
}

@Controller('session')
export class SessionController {
  constructor(private readonly sessions: SessionRepository, private readonly config: ConfigService) {}

  @Get()
  async get(@Req() req: TenantRequest, @Res({ passthrough: true }) res: Response): Promise<SessionDto> {
    res.setHeader('Cache-Control', 'no-store');
    const tenantId = req.tenantId;
    const token = sessionToken(req);
    const memberships = token ? await this.sessions.list(token) : [];
    const selected = tenantId ? memberships.find((row) => row.tenantId === tenantId) : undefined;
    return { member: selected ?? memberships[0] ?? null, memberships, demoEnabled: this.demoEnabled() };
  }

  @Post('demo')
  @HttpCode(204)
  async demo(@Body() body: DemoSessionDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    if (!this.demoEnabled()) throw new NotFoundException();
    assertSameOriginMutation(req);
    const previous = sessionToken(req);
    if (previous) await this.sessions.revoke(previous);
    const token = await this.sessions.create(DEMO_USERS[body.role]);
    const options = { httpOnly: true, sameSite: 'strict' as const, path: '/api', maxAge: 8 * 60 * 60 * 1_000 };
    res.cookie(SESSION_COOKIE, token, options);
    res.setHeader('Cache-Control', 'no-store');
  }

  @Delete()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    assertSameOriginMutation(req);
    await this.sessions.revoke(sessionToken(req));
    res.clearCookie(SESSION_COOKIE, { path: '/api' });
  }

  private demoEnabled(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production' && this.config.get<boolean>('DEMO_AUTH_ENABLED') === true;
  }
}
