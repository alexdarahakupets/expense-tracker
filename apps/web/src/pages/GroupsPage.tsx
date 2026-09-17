/**
 * Placeholder for the expense-group list.
 *
 * Slice 2 replaces this with the real thing: groups you belong to, a create
 * form, and links into `/expenses/:groupId`. It is a stub rather than a fetch
 * against a route that does not exist yet — the tab has to be navigable for
 * this slice to be verifiable on its own.
 */
export function GroupsPage() {
  return (
    <>
      <h1>Expenses</h1>
      <p className="muted">
        Expense groups arrive in the next slice. You&apos;ll be able to create a group, add
        people to it by email, and record what everyone spent.
      </p>
    </>
  );
}
