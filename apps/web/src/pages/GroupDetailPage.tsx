import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  addGroupMemberSchema,
  groupDetailResponseSchema,
  type GroupDetail,
} from '@expense-tracker/shared';
import { ApiError, getJson, postJson } from '../lib/api.js';

type Fetched<T> = { kind: 'loading' } | { kind: 'ok'; value: T } | { kind: 'error'; message: string };

/**
 * One group: who is in it, and (from the next slice) what was spent.
 *
 * A 404 here is the normal response for a group you are not in — the server does
 * not distinguish that from a group that never existed, so neither does this
 * page.
 */
export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();

  const [group, setGroup] = useState<Fetched<GroupDetail>>({ kind: 'loading' });
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
      } catch (error) {
        if (signal.aborted) return;
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

      <section>
        <h2>Expenses</h2>
        <p className="muted">
          Recording expenses lands in the next slice — amounts, currency, who paid, and how
          the cost splits between members.
        </p>
      </section>
    </>
  );
}
