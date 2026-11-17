import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupMemberRole } from './entities/group-member.entity';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_: unknown, v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
  };
  const groupsRepo = { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const membersRepo = {
    findOne: jest.fn(),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: unknown) => v),
    remove: jest.fn(),
  };
  const users = { findByEmail: jest.fn() };
  const audit = { record: jest.fn() };
  const notifications = { createForUser: jest.fn() };
  const service = new GroupsService(
    groupsRepo as never,
    membersRepo as never,
    {} as never,
    dataSource as never,
    users as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    manager.create.mockImplementation((_: unknown, v: unknown) => v);
    manager.save.mockImplementation(async (v: unknown) => v);
    membersRepo.create.mockImplementation((v: unknown) => v);
    membersRepo.save.mockImplementation(async (v: unknown) => v);
    dataSource.transaction.mockImplementation(
      (cb: (m: typeof manager) => unknown) => cb(manager),
    );
  });

  const asRole = (role: GroupMemberRole | null) =>
    membersRepo.findOne.mockResolvedValueOnce(role ? { role } : null);

  it('creates the group and the owner membership together', async () => {
    manager.save.mockImplementationOnce(async (v: object) => ({
      ...v,
      id: 'g1',
    }));
    await service.create('u1', { name: 'Trip' });
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: GroupMemberRole.OWNER, userId: 'u1' }),
    );
  });

  it('returns 404 to a non-member', async () => {
    asRole(null);
    await expect(service.findOne('u9', 'g1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('forbids a plain member from updating the group', async () => {
    asRole(GroupMemberRole.MEMBER);
    await expect(service.update('u2', 'g1', { name: 'x' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('forbids a plain member from adding members', async () => {
    asRole(GroupMemberRole.MEMBER);
    await expect(
      service.addMember('u2', 'g1', { email: 'a@b.com' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects adding someone who is already a member', async () => {
    asRole(GroupMemberRole.OWNER);
    groupsRepo.findOne.mockResolvedValue({ id: 'g1', name: 'Trip' });
    users.findByEmail.mockResolvedValue({ id: 'u2' });
    membersRepo.findOne.mockResolvedValueOnce({ id: 'm2' });
    await expect(
      service.addMember('u1', 'g1', { email: 'a@b.com' }),
    ).rejects.toThrow(ConflictException);
  });

  it('adds a member and notifies them', async () => {
    asRole(GroupMemberRole.OWNER);
    groupsRepo.findOne.mockResolvedValue({ id: 'g1', name: 'Trip' });
    users.findByEmail.mockResolvedValue({ id: 'u2' });
    membersRepo.findOne.mockResolvedValueOnce(null);
    await service.addMember('u1', 'g1', { email: 'a@b.com' });
    expect(notifications.createForUser).toHaveBeenCalledWith(
      'u2',
      expect.objectContaining({ title: 'Added to a group' }),
    );
  });

  it('forbids a member from removing another member', async () => {
    asRole(GroupMemberRole.MEMBER);
    await expect(service.removeMember('u2', 'g1', 'u3')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets a member leave the group', async () => {
    asRole(GroupMemberRole.MEMBER);
    membersRepo.findOne.mockResolvedValueOnce({
      role: GroupMemberRole.MEMBER,
    });
    await service.removeMember('u2', 'g1', 'u2');
    expect(membersRepo.remove).toHaveBeenCalled();
  });

  it('never removes the owner', async () => {
    asRole(GroupMemberRole.OWNER);
    membersRepo.findOne.mockResolvedValueOnce({ role: GroupMemberRole.OWNER });
    await expect(service.removeMember('u1', 'g1', 'u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('adds a contribution to the group total', async () => {
    asRole(GroupMemberRole.MEMBER);
    manager.findOne.mockResolvedValue({ id: 'g1', currentAmount: '10.00' });
    const res = await service.contribute('u2', 'g1', { amount: 5.25 });
    expect(res.group.currentAmount).toBe('15.25');
  });

  it('blocks a non-member from contributing', async () => {
    asRole(null);
    await expect(service.contribute('u9', 'g1', { amount: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });
});
