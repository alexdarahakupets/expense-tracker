import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client.js';
import {
  addMember,
  createGroup,
  createUser,
  resetDomainTables,
  type TestUser,
} from './helpers.js';

/**
 * Expense rules: the split must balance, everyone named must be in the group,
 * and currencies are never mixed.
 *
 * The balance rule is the one that CANNOT be a database constraint — it spans
 * rows — so these are the only automated guard it has.
 */
let alice: TestUser;
let bob: TestUser;
let outsider: TestUser;
let groupId: string;

/** A valid 10.00 EUR expense paid by Alice, split 6/4 with Bob. */
function validExpense(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Dinner',
    amountCents: 1000,
    currency: 'EUR',
    category: 'food',
    paidBy: alice.id,
    shares: [
      { userId: alice.id, shareCents: 600 },
      { userId: bob.id, shareCents: 400 },
    ],
    ...overrides,
  };
}

async function countExpenses(): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from expense`,
  );
  return result.rows[0]?.count ?? 0;
}

beforeAll(async () => {
  alice = await createUser('Alice', 'alice@test.local');
  bob = await createUser('Bob', 'bob@test.local');
  outsider = await createUser('Outsider', 'outsider-exp@test.local');
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDomainTables();
  groupId = await createGroup(alice, 'Expenses');
  await addMember(alice, groupId, bob);
});

describe('the split must balance', () => {
  it('rejects shares that add up to less than the total', async () => {
    const response = await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ shares: [{ userId: alice.id, shareCents: 600 }] }))
      .expect(400);

    // The message quotes both figures, because "invalid" alone gives the user
    // nothing to correct.
    expect(response.body.error).toContain('6.00');
    expect(response.body.error).toContain('10.00');
  });

  it('rejects shares that add up to more than the total', async () => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          shares: [
            { userId: alice.id, shareCents: 900 },
            { userId: bob.id, shareCents: 400 },
          ],
        }),
      )
      .expect(400);
  });

  it('rejects the same person appearing twice in the split', async () => {
    // Without this the composite primary key would reject the insert as a
    // constraint violation, surfacing as a 500 instead of something actionable.
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          shares: [
            { userId: alice.id, shareCents: 600 },
            { userId: alice.id, shareCents: 400 },
          ],
        }),
      )
      .expect(400);
  });

  it('accepts a zero share for someone who sat this one out', async () => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          shares: [
            { userId: alice.id, shareCents: 1000 },
            { userId: bob.id, shareCents: 0 },
          ],
        }),
      )
      .expect(201);
  });

  it('leaves nothing behind when it rejects one', async () => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ shares: [{ userId: alice.id, shareCents: 1 }] }))
      .expect(400);

    expect(await countExpenses()).toBe(0);
  });
});

describe('everyone named must be in the group', () => {
  it('rejects an outsider as the payer', async () => {
    // 400 rather than 404: the caller is already in the group, so this tells
    // them nothing they could not read off the member list.
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ paidBy: outsider.id }))
      .expect(400);
  });

  it('rejects an outsider in the split', async () => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          shares: [
            { userId: alice.id, shareCents: 600 },
            { userId: outsider.id, shareCents: 400 },
          ],
        }),
      )
      .expect(400);
  });

  it('lets one member record an expense that another member paid', async () => {
    const response = await bob.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ paidBy: alice.id }))
      .expect(201);

    expect(response.body.expense.paidBy).toBe(alice.id);
  });
});

describe('amounts and currencies', () => {
  it.each([
    ['zero', 0],
    ['negative', -500],
    ['beyond the int4 column', 2_147_483_648],
  ])('rejects an amount that is %s', async (_label, amountCents) => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          amountCents,
          shares: [{ userId: alice.id, shareCents: amountCents }],
        }),
      )
      .expect(400);
  });

  it('rejects a negative share even when the total still balances', async () => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          shares: [
            { userId: alice.id, shareCents: 1500 },
            { userId: bob.id, shareCents: -500 },
          ],
        }),
      )
      .expect(400);
  });

  it.each(['EURO', 'E', '12', ''])('rejects %j as a currency code', async (currency) => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ currency }))
      .expect(400);
  });

  it('normalises a lowercase code so eur and EUR are one currency', async () => {
    const response = await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ currency: 'eur' }))
      .expect(201);

    expect(response.body.expense.currency).toBe('EUR');
  });
});

describe('expenses stay inside their group', () => {
  it('does not leak into another group the caller also belongs to', async () => {
    await alice.agent.post(`/api/groups/${groupId}/expenses`).send(validExpense()).expect(201);

    const other = await createGroup(alice, 'Other');
    const response = await alice.agent.get(`/api/groups/${other}/expenses`).expect(200);

    expect(response.body.expenses).toEqual([]);
  });
});

describe('the summary', () => {
  it('nets to zero in every currency, because the split always balances', async () => {
    await alice.agent.post(`/api/groups/${groupId}/expenses`).send(validExpense()).expect(201);
    await bob.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(
        validExpense({
          amountCents: 5000,
          currency: 'USD',
          paidBy: bob.id,
          shares: [
            { userId: alice.id, shareCents: 2500 },
            { userId: bob.id, shareCents: 2500 },
          ],
        }),
      )
      .expect(201);

    const response = await alice.agent.get(`/api/groups/${groupId}/summary`).expect(200);
    const currencies = response.body.summary.currencies as {
      currency: string;
      totalCents: number;
      balances: { netCents: number }[];
    }[];

    expect(currencies.map((entry) => entry.currency)).toEqual(['EUR', 'USD']);

    for (const entry of currencies) {
      const net = entry.balances.reduce((total, balance) => total + balance.netCents, 0);
      // A closed system: every cent paid is a cent owed by someone.
      expect(net).toBe(0);
    }
  });

  it('keeps currencies apart instead of adding them together', async () => {
    await alice.agent.post(`/api/groups/${groupId}/expenses`).send(validExpense()).expect(201);
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ currency: 'USD' }))
      .expect(201);

    const response = await alice.agent.get(`/api/groups/${groupId}/summary`).expect(200);
    const currencies = response.body.summary.currencies as {
      currency: string;
      totalCents: number;
    }[];

    // Two 10.00 expenses in different currencies must NOT become one 20.00.
    expect(currencies).toHaveLength(2);
    for (const entry of currencies) {
      expect(entry.totalCents).toBe(1000);
    }
  });

  it('includes a member with no activity, so the roster does not shift', async () => {
    await alice.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(validExpense({ shares: [{ userId: alice.id, shareCents: 1000 }] }))
      .expect(201);

    const response = await alice.agent.get(`/api/groups/${groupId}/summary`).expect(200);
    const balances = response.body.summary.currencies[0].balances as {
      userId: string;
      name: string;
      paidCents: number;
      owedCents: number;
      netCents: number;
    }[];

    expect(balances.find((balance) => balance.userId === bob.id)).toEqual({
      userId: bob.id,
      name: 'Bob',
      paidCents: 0,
      owedCents: 0,
      netCents: 0,
    });
  });
});
