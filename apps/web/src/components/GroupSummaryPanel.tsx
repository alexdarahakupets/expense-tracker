import { formatCents, type GroupSummary } from '@expense-tracker/shared';

interface Props {
  summary: GroupSummary;
  isOwner: boolean;
  settling: boolean;
  onSettle: () => void;
}

/**
 * What the group adds up to, per currency.
 *
 * Presentational only — every figure comes from `GET /api/groups/:id/summary`,
 * computed by Postgres. Recomputing the balances here from the expense list
 * would be a second implementation of the same arithmetic, free to disagree with
 * the first.
 *
 * Currencies are listed separately and never combined: adding EUR to USD needs a
 * rate this app does not store.
 */
export function GroupSummaryPanel({ summary, isOwner, settling, onSettle }: Props) {
  const settled = summary.settledAt !== null;

  if (summary.currencies.length === 0) {
    return (
      <section>
        <h2>Summary</h2>
        <p className="muted">Nothing to total up yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Summary</h2>

      {settled && (
        <p className="muted">Settled on {summary.settledAt?.slice(0, 10)}.</p>
      )}

      {summary.currencies.map((entry) => (
        <div className="currency-block" key={entry.currency}>
          <h3>
            {formatCents(entry.totalCents)} {entry.currency}
            <span className="muted">
              {' '}
              · {entry.expenseCount} {entry.expenseCount === 1 ? 'expense' : 'expenses'}
            </span>
          </h3>

          <table className="balances">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Paid</th>
                <th scope="col">Share</th>
                <th scope="col">Net</th>
              </tr>
            </thead>
            <tbody>
              {entry.balances.map((balance) => (
                <tr key={balance.userId}>
                  <th scope="row">{balance.name}</th>
                  <td>{formatCents(balance.paidCents)}</td>
                  <td>{formatCents(balance.owedCents)}</td>
                  {/*
                    The sign is the whole message, so it is spelled out rather
                    than left to a colour a screen reader cannot announce and a
                    greyscale display cannot show.
                  */}
                  <td className={balance.netCents < 0 ? 'owes' : 'owed'}>
                    {formatCents(balance.netCents)}
                    <span className="muted">
                      {balance.netCents === 0
                        ? ' settled up'
                        : balance.netCents > 0
                          ? ' is owed'
                          : ' owes'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {isOwner && !settled && (
        <p>
          <button
            type="submit"
            disabled={settling}
            onClick={() => {
              // Irreversible with today's API — there is no un-settle route — so
              // it asks first.
              if (window.confirm('Close this group out? This cannot be undone.')) {
                onSettle();
              }
            }}
          >
            {settling ? 'Settling…' : 'Settle group'}
          </button>
        </p>
      )}

      <p className="muted">
        Balances only. Working out who pays whom to clear them needs settlement rules
        (and a rate for multi-currency groups) that aren&apos;t decided yet.
      </p>
    </section>
  );
}
