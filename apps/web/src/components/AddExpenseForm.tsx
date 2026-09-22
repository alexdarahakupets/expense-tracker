import { useState, type FormEvent } from 'react';
import {
  createExpenseSchema,
  expenseResponseSchema,
  formatCents,
  parseAmountToCents,
  splitEvenly,
  sumCents,
  type Expense,
  type GroupMember,
} from '@expense-tracker/shared';
import { postJson } from '../lib/api.js';

interface Props {
  groupId: string;
  members: GroupMember[];
  onCreated: (expense: Expense) => void;
}

/**
 * Record an expense and choose how it splits.
 *
 * The amount is typed in major units (`12.34`) and converted ONCE, here, with
 * `parseAmountToCents` — string arithmetic, never `parseFloat`. Everything
 * downstream, including the wire format, is integer cents.
 *
 * Shares start as an even split and stay editable. The running difference is
 * shown rather than hidden, because "shares must sum to the total" is a rule the
 * user has to satisfy by hand and they need to see how far off they are.
 */
export function AddExpenseForm({ groupId, members, onCreated }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [category, setCategory] = useState('general');
  const [paidBy, setPaidBy] = useState(members[0]?.userId ?? '');

  /**
   * The shares the user has TYPED, tagged with the membership they were typed
   * against. Null means "nobody has touched the split", and the even division is
   * derived during render instead.
   *
   * Deriving rather than writing state in an effect avoids a cascading render on
   * every keystroke. The key is the MEMBER LIST, deliberately not the amount:
   * once someone edits the split by hand it is theirs to keep, and changing the
   * amount leaves those numbers alone and simply reports the difference. Adding
   * or removing a member does reset it, because a split that omits a member
   * cannot be submitted at all.
   */
  const [typed, setTyped] = useState<{ key: string; values: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amountCents = parseAmountToCents(amount);

  const splitKey = members.map((member) => member.userId).join(',');
  const typedValues = typed?.key === splitKey ? typed.values : {};
  const evenShares = amountCents === null ? [] : splitEvenly(amountCents, members.length);

  /** What each box shows: the user's own edit, else this member's even share. */
  const displayed: Record<string, string> = Object.fromEntries(
    members.map((member, index) => [
      member.userId,
      typedValues[member.userId] ?? (amountCents === null ? '' : formatCents(evenShares[index] ?? 0)),
    ]),
  );

  function setShare(userId: string, value: string) {
    // Seed from `displayed` so the even split the user could see becomes their
    // starting point, rather than the other boxes blanking on first edit.
    setTyped({ key: splitKey, values: { ...displayed, [userId]: value } });
  }

  /** True once the split has been hand-edited and stopped tracking the amount. */
  const edited = typed?.key === splitKey;

  // Parsed back out of the inputs the same way the amount is — as strings,
  // never as floats.
  const shareCentsByUser = members.map((member) => ({
    userId: member.userId,
    cents: parseAmountToCents(displayed[member.userId] ?? ''),
  }));

  const allSharesValid = shareCentsByUser.every((share) => share.cents !== null);
  const sharesTotal = sumCents(shareCentsByUser.map((share) => share.cents ?? 0));
  const difference = amountCents === null ? 0 : sharesTotal - amountCents;
  const balanced = amountCents !== null && allSharesValid && difference === 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (amountCents === null) {
      setError('Enter an amount like 12.34');
      return;
    }

    // The same shared schema the server enforces, so the browser rejects
    // exactly what the API would, with the same wording.
    const parsed = createExpenseSchema.safeParse({
      description,
      amountCents,
      currency,
      category,
      paidBy,
      shares: shareCentsByUser
        .filter((share) => share.cents !== null)
        .map((share) => ({ userId: share.userId, shareCents: share.cents ?? 0 })),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    setSubmitting(true);
    try {
      const created = await postJson(`/api/groups/${groupId}/expenses`, parsed.data, (input) =>
        expenseResponseSchema.parse(input).expense,
      );
      onCreated(created);
      setDescription('');
      setAmount('');
      setTyped(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not save the expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="field">
        <label htmlFor="expense-description">What was it?</label>
        <input
          id="expense-description"
          placeholder="Dinner"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="expense-amount">Amount</label>
          <input
            id="expense-amount"
            inputMode="decimal"
            placeholder="12.34"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="expense-currency">Currency</label>
          <input
            id="expense-currency"
            maxLength={3}
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value.toUpperCase());
            }}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="expense-category">Category</label>
        <input
          id="expense-category"
          placeholder="general"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="expense-paid-by">Who paid?</label>
        <select
          id="expense-paid-by"
          value={paidBy}
          onChange={(event) => {
            setPaidBy(event.target.value);
          }}
        >
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="split">
        <legend>Split</legend>

        {edited && (
          <p className="muted split-hint">
            Edited by hand, so it no longer follows the amount.{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setTyped(null);
              }}
            >
              Split evenly again
            </button>
          </p>
        )}
        {members.map((member) => (
          <div className="field" key={member.userId}>
            <label htmlFor={`share-${member.userId}`}>{member.name}</label>
            <input
              id={`share-${member.userId}`}
              inputMode="decimal"
              value={displayed[member.userId] ?? ''}
              onChange={(event) => {
                setShare(member.userId, event.target.value);
              }}
            />
          </div>
        ))}

        {amountCents !== null && !balanced && (
          <p className="error">
            {allSharesValid
              ? difference > 0
                ? `${formatCents(difference)} ${currency} over the total`
                : `${formatCents(-difference)} ${currency} still unassigned`
              : 'Every share needs an amount like 12.34'}
          </p>
        )}
      </fieldset>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={submitting || !balanced}>
        {submitting ? 'Saving…' : 'Add expense'}
      </button>
    </form>
  );
}
