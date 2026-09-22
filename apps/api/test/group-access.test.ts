import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import {
  addMember,
  app,
  createGroup,
  createUser,
  resetDomainTables,
  type TestUser,
} from './helpers.js';
import request from 'supertest';

/**
 * The authorization boundary: membership is the only thing that grants access to
 * a group, and a non-member must be indistinguishable from a wrong id.
 *
 * CLAUDE.md states this as non-negotiable. Until now it was only ever checked by
 * hand with curl.
 */
let owner: TestUser;
let member: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  owner = await createUser('Owner', 'owner@test.local');
  member = await createUser('Member', 'member@test.local');
  outsider = await createUser('Outsider', 'outsider@test.local');
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDomainTables();
});

describe('a non-member', () => {
  /**
   * Every group-scoped route. This list is maintained by hand — a new route that
   * forgets `requireGroupMembership` will not fail this test until someone adds
   * it here, so add the route and the row together.
   */
  const routes = [
    { method: 'get', path: (id: string) => `/api/groups/${id}` },
    { method: 'post', path: (id: string) => `/api/groups/${id}/members` },
    { method: 'get', path: (id: string) => `/api/groups/${id}/expenses` },
    { method: 'post', path: (id: string) => `/api/groups/${id}/expenses` },
    { method: 'get', path: (id: string) => `/api/groups/${id}/summary` },
    { method: 'post', path: (id: string) => `/api/groups/${id}/settle` },
  ] as const;

  it.each(routes)('gets 404 — never 403 — from $method $path', async ({ method, path }) => {
    const groupId = await createGroup(owner);

    const response = await outsider.agent[method](path(groupId)).send({});

    // 403 would confirm the id names a real group, which is what turns group ids
    // into something worth guessing.
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  it('is checked BEFORE the request body is validated', async () => {
    const groupId = await createGroup(owner);

    // Garbage body. A 400 here would mean validation ran first, which leaks the
    // fact that the group exists via the difference in status code.
    const response = await outsider.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send({ nonsense: true });

    expect(response.status).toBe(404);
  });

  it('cannot see the group in their own list', async () => {
    await createGroup(owner, 'Private');

    const response = await outsider.agent.get('/api/groups').expect(200);

    expect(response.body.groups).toEqual([]);
  });
});

describe('group ids', () => {
  it('answer 404 for a malformed uuid, not a 500 from the driver', async () => {
    await outsider.agent.get('/api/groups/not-a-uuid').expect(404);
  });

  it('answer 404 for a well-formed uuid that does not exist', async () => {
    await outsider.agent.get('/api/groups/00000000-0000-4000-8000-000000000000').expect(404);
  });
});

describe('an unauthenticated caller', () => {
  it('gets 401 from a group route', async () => {
    const groupId = await createGroup(owner);

    await request(app).get(`/api/groups/${groupId}`).expect(401);
  });

  it('gets 401 — not 404 — for an unknown /api path, so routes cannot be enumerated', async () => {
    await request(app).get('/api/no-such-route').expect(401);
  });
});

describe('a member who is not the owner', () => {
  it('can read the group', async () => {
    const groupId = await createGroup(owner);
    await addMember(owner, groupId, member);

    const response = await member.agent.get(`/api/groups/${groupId}`).expect(200);

    expect(response.body.group.viewerRole).toBe('member');
  });

  it('gets 403 adding someone, because they can already see the member list', async () => {
    const groupId = await createGroup(owner);
    await addMember(owner, groupId, member);

    // 403 rather than 404 is correct HERE and nowhere else: they can already see
    // the group, so naming the restriction reveals nothing new.
    await member.agent
      .post(`/api/groups/${groupId}/members`)
      .send({ email: outsider.email })
      .expect(403);
  });

  it('gets 403 settling the group', async () => {
    const groupId = await createGroup(owner);
    await addMember(owner, groupId, member);

    await member.agent.post(`/api/groups/${groupId}/settle`).send({}).expect(403);
  });
});

describe('the owner', () => {
  it('cannot add the same person twice', async () => {
    const groupId = await createGroup(owner);
    await addMember(owner, groupId, member);

    await owner.agent
      .post(`/api/groups/${groupId}/members`)
      .send({ email: member.email })
      .expect(409);
  });

  it('matches an email regardless of how it was capitalised', async () => {
    const groupId = await createGroup(owner);

    await owner.agent
      .post(`/api/groups/${groupId}/members`)
      .send({ email: member.email.toUpperCase() })
      .expect(201);
  });

  it('gets 404 for an email with no account', async () => {
    const groupId = await createGroup(owner);

    await owner.agent
      .post(`/api/groups/${groupId}/members`)
      .send({ email: 'nobody@test.local' })
      .expect(404);
  });

  it('can settle once, and not twice', async () => {
    const groupId = await createGroup(owner);

    await owner.agent.post(`/api/groups/${groupId}/settle`).send({}).expect(200);
    await owner.agent.post(`/api/groups/${groupId}/settle`).send({}).expect(409);
  });
});

describe('groups are isolated from one another', () => {
  it('lists only the groups the caller belongs to', async () => {
    const ownerGroup = await createGroup(owner, 'Owner group');
    await createGroup(outsider, 'Outsider group');
    await addMember(owner, ownerGroup, member);

    const ownerList = await owner.agent.get('/api/groups').expect(200);
    const memberList = await member.agent.get('/api/groups').expect(200);

    expect(ownerList.body.groups.map((g: { title: string }) => g.title)).toEqual(['Owner group']);
    expect(memberList.body.groups.map((g: { title: string }) => g.title)).toEqual(['Owner group']);
  });
});
