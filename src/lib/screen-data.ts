type ScreenQuery = {
  isLoading: boolean;
  isError: boolean;
  /** True when a background refresh failed but the earlier answer is still in hand. */
  isRefetchError?: boolean;
  refetch: () => unknown;
};

/**
 * Whether a screen has everything it needs to show its figures, given every
 * query those figures are built from.
 *
 * Screens used to wait for two or three of their queries and draw as soon as
 * those landed. On a slow connection the rest arrived over the next few
 * seconds, so a screen could show a wrong figure (a weekly amount without the
 * bills taken off, a free-to-spend without planned spending) and then change
 * it. Passing EVERY query here closes that: nothing is drawn until all of them
 * have answered, and any one failing shows the error state instead of a figure
 * quietly built without it.
 *
 * `isLoading` is only true on a query's first fetch, so background refreshes
 * never blank a screen that's already showing. Queries switched off for now
 * (no household yet, a week that doesn't apply) don't hold anything up.
 *
 * Likewise a background refresh that fails (the app just woke up with no
 * network yet) keeps the figures already on screen instead of swapping them
 * for the error state; they're from the last good answer, not built without
 * it. The failed query tries again on the next refresh.
 */
export function screenData(householdId: string | null, queries: ScreenQuery[]) {
  return {
    loading: !householdId || queries.some((q) => q.isLoading),
    failed: queries.some((q) => q.isError && !q.isRefetchError),
    retry: () => {
      for (const q of queries) if (q.isError) q.refetch();
    },
  };
}
