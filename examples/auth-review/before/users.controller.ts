@Controller('users')
@UseGuards(SessionGuard)
class UsersController {
  @Get() list() {}
  @Post() @Roles('ADMIN') create() {}
}
