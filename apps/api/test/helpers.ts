import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';

/** A supertest agent that carries one user's session cookie. */
export type Agent = ReturnType<typeof request.agent>;

export interface TestUser {
  agent: Agent;
  id: string;
  email: string;
  name: string;
}

export const PASSWORD = 'test-password-1234';

/** One app instance for the suite — `createApp` binds no port. */
export const app: Express = createApp();

/**
 * Wipe the domain tables between tests.
 *
 * Deliberately leaves `user`, `session` and `account` alone: sign-up runs a
 * scrypt hash, so recreating accounts for every case would dominate the runtime.
 * Domain rows carry no state that survives a truncate, so tests stay isolated
 * regardless.
 */
export async function resetDomainTables(): Promise<void> {
  await db.execute(
    sql`truncate table expense_share, expense, group_member, expense_group restart identity cascade`,
  );
}

/**
 * Register a user through the REAL auth endpoint and keep the session cookie.
 *
 * Going through HTTP rather than inserting rows directly is the point: it proves
 * the cookie the browser would receive is the same one these tests authenticate
 * with, so a change to the auth config shows up here.
 */
export async function createUser(name: string, email: string): Promise<TestUser> {
  const agent = request.agent(app);

  await agent
    .post('/api/auth/sign-up/email')
    .send({ name, email, password: PASSWORD })
    .expect(200);

  const me = await agent.get('/api/me').expect(200);

  return { agent, id: me.body.user.id as string, email, name };
}

/** Create a group owned by `owner`, returning its id. */
export async function createGroup(owner: TestUser, title = 'Test group'): Promise<string> {
  const response = await owner.agent
    .post('/api/groups')
    .send({ title, groupType: 'test' })
    .expect(201);

  return response.body.group.id as string;
}

/** Add an existing account to a group. The caller must be its owner. */
export async function addMember(owner: TestUser, groupId: string, member: TestUser): Promise<void> {
  await owner.agent
    .post(`/api/groups/${groupId}/members`)
    .send({ email: member.email })
    .expect(201);
}
