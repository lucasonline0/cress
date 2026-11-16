import { Controller, Get, Post, UseGuards } from '@nestjs/common';
@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  @Get() list() {}
  @Post(':id') create() {}
  @Roles('ADMIN') @Get('admin') admin() {}
}
function Roles(...roles: string[]): MethodDecorator { void roles; return () => undefined; }
class SessionGuard {}
