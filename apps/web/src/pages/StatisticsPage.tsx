/**
 * Intentionally empty for now.
 *
 * Statistics read from the group summary endpoint that arrives in slice 4
 * (`GET /api/groups/:id/summary`), so there is nothing truthful to show until
 * expenses exist. A placeholder that says so beats a chart of fake numbers.
 */
export function StatisticsPage() {
  return (
    <>
      <h1>Statistics</h1>
      <p className="muted">
        Nothing to chart yet — this fills in once expenses and group summaries land.
      </p>
    </>
  );
}
