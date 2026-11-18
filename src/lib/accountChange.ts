import type { QueryClient } from "@tanstack/react-query";

// The key of the query that holds the signed-in account (GET /accounts/me).
export const ACCOUNT_KEY = "me";

// Removes the data of each other query when a different account signs in, so
// that the new account does not get data that the server sent to the account
// before. This occurs when a person signs in with a different account in the
// "Sign in again" dialog. The same account keeps its data. Returns the
// function that stops the watch.
export function watchAccountChange(queryClient: QueryClient): () => void {
  let accountId: string | undefined;
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success" || event.query.queryKey[0] !== ACCOUNT_KEY) return;
    const id = (event.query.state.data as { id?: string } | undefined)?.id;
    if (id === undefined) return;
    if (accountId !== undefined && id !== accountId) {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ACCOUNT_KEY });
    }
    accountId = id;
  });
}

// Stops each read of the account that is in progress, so that its answer does
// not go to the page. Call this after a sign-in, before the write of the new
// account: a read that left before the sign-in can return the account before,
// and its late answer would replace the new account.
export function stopAccountReads(queryClient: QueryClient): Promise<void> {
  return queryClient.cancelQueries({ queryKey: [ACCOUNT_KEY] });
}
