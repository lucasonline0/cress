import { Controller, Get, UseGuards } from '@nestjs/common';
@Controller('')
export class ProfileController {
  @Get('profile') @UseGuards(JwtGuard) current() {}
  @Get('health') @Public() health() {}
}
function Public(): MethodDecorator { return () => undefined; }
class JwtGuard {}
