import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  createGroupSchema,
  groupDetailResponseSchema,
  groupListResponseSchema,
  type GroupListItem,
} from '@expense-tracker/shared';
import { getJson, postJson } from '../lib/api.js';

type Fetched<T> = { kind: 'loading' } | { kind: 'ok'; value: T } | { kind: 'error'; message: string };

/**
 * The groups you belong to, and a form to start another.
 *
 * The list is whatever `GET /api/groups` returns — the server decides what you
 * can see by joining `group_member`, and this page never filters. A group you
 * were removed from simply stops arriving.
 */
export function GroupsPage() {
  const [groups, setGroups] = useState<Fetched<GroupListItem[]>>({ kind: 'loading' });

  const [title, setTitle] = useState('');
  const [groupType, setGroupType] = useState('general');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    // Declared inside the effect rather than hoisted into a `useCallback`: the
    // lint rule that forbids synchronous setState in an effect can only see that
    // these writes happen after an await when the function body is right here.
    async function load(signal: AbortSignal) {
      try {
        const value = await getJson(
          '/api/groups',
          (input) => groupListResponseSchema.parse(input).groups,
          signal,
        );
        setGroups({ kind: 'ok', value });
      } catch (error) {
        if (signal.aborted) return;
        setGroups({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Client-side Zod is a UX affordance only — the server validates the same
    // schema at the route boundary and is what actually decides.
    const parsed = createGroupSchema.safeParse({ title, groupType });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    setSubmitting(true);
    try {
      const created = await postJson('/api/groups', parsed.data, (input) =>
        groupDetailResponseSchema.parse(input).group,
      );

      // Prepend rather than refetch: the list is ordered newest-first, so this
      // matches what a reload would show without a second round trip.
      setGroups((current) =>
        current.kind === 'ok'
          ? { kind: 'ok', value: [{ ...created, memberCount: created.members.length }, ...current.value] }
          : current,
      );
      setTitle('');
      setGroupType('general');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create the group');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Expenses</h1>
      <p className="muted">Groups you share with other people.</p>

      <form className="auth-form" onSubmit={(event) => void handleCreate(event)} noValidate>
        <div className="field">
          <label htmlFor="group-title">New group</label>
          <input
            id="group-title"
            name="title"
            placeholder="Trip to Rome"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="group-type">Type</label>
          <input
            id="group-type"
            name="groupType"
            placeholder="general"
            value={groupType}
            onChange={(event) => {
              setGroupType(event.target.value);
            }}
          />
        </div>

        {formError && <p className="error">{formError}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create group'}
        </button>
      </form>

      <section>
        {groups.kind === 'loading' && <p>Loading…</p>}
        {groups.kind === 'error' && <p className="error">Could not load groups: {groups.message}</p>}

        {groups.kind === 'ok' && groups.value.length === 0 && (
          <p className="muted">No groups yet. Create one above to get started.</p>
        )}

        {groups.kind === 'ok' && groups.value.length > 0 && (
          <ul className="card-list">
            {groups.value.map((group) => (
              <li key={group.id}>
                <Link to={`/expenses/${group.id}`}>{group.title}</Link>
                <span className="muted">
                  {group.groupType} · {group.memberCount}{' '}
                  {group.memberCount === 1 ? 'member' : 'members'}
                  {group.settledAt !== null && ' · settled'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
