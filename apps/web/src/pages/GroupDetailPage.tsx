import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  addGroupMemberSchema,
  expenseListResponseSchema,
  formatCents,
  groupDetailResponseSchema,
  groupSummaryResponseSchema,
  type Expense,
  type GroupDetail,
  type GroupSummary,
} from '@expense-tracker/shared';
import { AddExpenseForm } from '../components/AddExpenseForm.js';
import { GroupSummaryPanel } from '../components/GroupSummaryPanel.js';
import { ApiError, getJson, postJson } from '../lib/api.js';

type Fetched<T> = { kind: 'loading' } | { kind: 'ok'; value: T } | { kind: 'error'; message: string };

/**
 * One group: who is in it and what was spent in it.
 *
 * A 404 here is the normal response for a group you are not in — the server does
 * not distinguish that from a group that never existed, so neither does this
 * page.
 */
export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();

  const [group, setGroup] = useState<Fetched<GroupDetail>>({ kind: 'loading' });
  const [expenses, setExpenses] = useState<Fetched<Expense[]>>({ kind: 'loading' });
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [settling, setSettling] = useState(false);
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (groupId === undefined) return undefined;

    const controller = new AbortController();

    async function load(id: string, signal: AbortSignal) {
      try {
        const value = await getJson(
          `/api/groups/${id}`,
          (input) => groupDetailResponseSchema.parse(input).group,
          signal,
        );
        setGroup({ kind: 'ok', value });

        // Only after the group resolves: if that 404s, the caller is not a
        // member and this request would 404 for the same reason.
        const loaded = await getJson(
          `/api/groups/${id}/expenses`,
          (input) => expenseListResponseSchema.parse(input).expenses,
          signal,
        );
        setExpenses({ kind: 'ok', value: loaded });

        setSummary(
          await getJson(
            `/api/groups/${id}/summary`,
            (input) => groupSummaryResponseSchema.parse(input).summary,
            signal,
          ),
        );
      } catch (error) {
        if (signal.aborted) return;
        setExpenses({ kind: 'error', message: 'Could not load expenses' });
        setGroup({
          kind: 'error',
          message:
            error instanceof ApiError && error.status === 404
              ? 'This group does not exist, or you are not a member of it.'
              : error instanceof Error
                ? error.message
                : 'Unknown error',
        });
      }
    }

    void load(groupId, controller.signal);
    return () => {
      controller.abort();
    };
  }, [groupId]);

  /**
   * Re-read the summary from the server after anything that changes the money.
   *
   * Deliberately a refetch rather than adjusting the balances locally: that
   * would be a second implementation of the same arithmetic, free to drift from
   * the one Postgres runs.
   */
  async function refreshSummary(id: string) {
    try {
      setSummary(
        await getJson(
          `/api/groups/${id}/summary`,
          (input) => groupSummaryResponseSchema.parse(input).summary,
          new AbortController().signal,
        ),
      );
    } catch {
      // A stale summary beside a fresh expense list is survivable; blanking the
      // panel because one request failed is not an improvement.
    }
  }

  async function handleSettle(id: string) {
    setSettling(true);
    try {
      const settled = await postJson(`/api/groups/${id}/settle`, {}, (input) =>
        groupSummaryResponseSchema.parse(input).summary,
      );
      setSummary(settled);
      setGroup((current) =>
        current.kind === 'ok'
          ? { kind: 'ok', value: { ...current.value, settledAt: settled.settledAt } }
          : current,
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not settle the group');
    } finally {
      setSettling(false);
    }
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (groupId === undefined) return;

    const parsed = addGroupMemberSchema.safeParse({ email });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the email address');
      return;
    }

    setSubmitting(true);
    try {
      // The server returns the whole group back, so the member list and count
      // stay consistent without a refetch or any local reconstruction.
      const updated = await postJson(`/api/groups/${groupId}/members`, parsed.data, (input) =>
        groupDetailResponseSchema.parse(input).group,
      );
      setGroup({ kind: 'ok', value: updated });
      setEmail('');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not add that person');
    } finally {
      setSubmitting(false);
    }
  }

  if (group.kind === 'loading') {
    return <p>Loading…</p>;
  }

  if (group.kind === 'error') {
    return (
      <>
        <h1>Group</h1>
        <p className="error">{group.message}</p>
        <p>
          <Link to="/expenses">Back to groups</Link>
        </p>
      </>
    );
  }

  const { value } = group;
  const isOwner = value.viewerRole === 'owner';

  return (
    <>
      <p className="muted">
        <Link to="/expenses">← Groups</Link>
      </p>

      <h1>{value.title}</h1>
      <p className="muted">
        {value.groupType} · created {value.createdAt.slice(0, 10)}
        {value.settledAt !== null && ' · settled'}
      </p>

      <section>
        <h2>Members</h2>
        <ul className="card-list">
          {value.members.map((member) => (
            <li key={member.userId}>
              <span>
                {member.name} {member.role === 'owner' && <span className="badge">owner</span>}
              </span>
              <span className="muted">{member.email}</span>
            </li>
          ))}
        </ul>

        {isOwner ? (
          <form className="auth-form" onSubmit={(event) => void handleAddMember(event)} noValidate>
            <div className="field">
              <label htmlFor="member-email">Add someone by email</label>
              <input
                id="member-email"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="bob@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </div>

            {formError && <p className="error">{formError}</p>}

            <button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add to group'}
            </button>
          </form>
        ) : (
          // A hint, not a control: the server rejects non-owners regardless of
          // what this component renders.
          <p className="muted">Only the group owner can add people.</p>
        )}
      </section>

      {summary !== null && (
        <GroupSummaryPanel
          summary={summary}
          isOwner={isOwner}
          settling={settling}
          onSettle={() => void handleSettle(value.id)}
        />
      )}

      <section>
        <h2>Expenses</h2>

        {expenses.kind === 'loading' && <p>Loading…</p>}
        {expenses.kind === 'error' && <p className="error">{expenses.message}</p>}

        {expenses.kind === 'ok' && expenses.value.length === 0 && (
          <p className="muted">Nothing recorded yet.</p>
        )}

        {expenses.kind === 'ok' && expenses.value.length > 0 && (
          <ul className="card-list">
            {expenses.value.map((item) => (
              <li key={item.id} className="expense">
                <div className="expense-head">
                  <span>{item.description}</span>
                  {/* Currency beside every figure, never a bare number: a group
                      can hold more than one and they are never added together. */}
                  <strong>
                    {formatCents(item.amountCents)} {item.currency}
                  </strong>
                </div>
                <span className="muted">
                  {item.paidByName} paid · {item.category} · {item.createdAt.slice(0, 10)}
                </span>
                <span className="muted">
                  {item.shares
                    .map((share) => `${share.name} ${formatCents(share.shareCents)}`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}

        <AddExpenseForm
          groupId={value.id}
          members={value.members}
          onCreated={(created) => {
            // Prepend: the list is newest-first, so this matches what a reload
            // would show without a second round trip.
            setExpenses((current) =>
              current.kind === 'ok'
                ? { kind: 'ok', value: [created, ...current.value] }
                : { kind: 'ok', value: [created] },
            );
            void refreshSummary(value.id);
          }}
        />
      </section>
    </>
  );
}
