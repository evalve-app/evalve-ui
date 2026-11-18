import { useQuery } from "@tanstack/react-query";
import { getAccount, getCurrentAccount } from "../../../api/client";
import { ownerLabel } from "../../../lib/backendLoops";

// The id of the viewer's own account, from the sign-in.
export function useViewerAccountId(): string | null {
  return useQuery({ queryKey: ["me"], queryFn: getCurrentAccount }).data?.id ?? null;
}

// The name of a Loop owner: "You", the Kitaru account name, or the first 8
// characters of the account id when Kitaru refuses the call. No live test has
// confirmed that each account can read each other account, so the fallback is needed.
export function useOwnerLabel(ownerAccountId: string): string {
  const viewer = useViewerAccountId();
  const account = useQuery({
    queryKey: ["account", ownerAccountId],
    queryFn: () => getAccount(ownerAccountId),
    enabled: ownerAccountId !== viewer,
    retry: false,
    staleTime: Infinity,
  });
  return ownerLabel(ownerAccountId, viewer, account.data?.name);
}
