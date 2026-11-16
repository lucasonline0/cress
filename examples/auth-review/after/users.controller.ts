@Controller('users')
class UsersController {
  @Get() list() {}
  @Post() @Roles('MEMBER') create() {}
}
