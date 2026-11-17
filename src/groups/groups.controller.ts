import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateGroupContributionDto } from './dto/create-group-contribution.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a group (caller becomes owner)' })
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List groups I belong to' })
  findAll(@CurrentUser() user: { userId: string }) {
    return this.groupsService.findAllForUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a group with its members (members only)' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a group (owner only)' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a group (owner only)' })
  delete(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.delete(user.userId, id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member by email (owner only)' })
  addMember(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.groupsService.addMember(user.userId, id, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member, or leave the group yourself' })
  removeMember(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.groupsService.removeMember(user.userId, id, targetUserId);
  }

  @Post(':id/contributions')
  @ApiOperation({ summary: 'Add money to the group (members only)' })
  contribute(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGroupContributionDto,
  ) {
    return this.groupsService.contribute(user.userId, id, dto);
  }

  @Get(':id/contributions')
  @ApiOperation({ summary: 'List group contributions (members only)' })
  findContributions(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groupsService.findContributions(user.userId, id);
  }
}
