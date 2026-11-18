import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelLoop } from "../../../api/evalve";
import { cancelWithTries } from "../../../lib/loopCancel";
import { LOOP_LISTS_KEY, loopQuery } from "../../../lib/queries";

// "Cancel Loop" for one backend Loop. The call stays in progress during the
// tries that follow a 503. The answer is the full Loop, so the Loop page shows
// it with no second read, and each Loop list reads its data again.
// API: POST /evalve/v1/loops/{loop_id}/cancel
export function useCancelLoop(loopId: string) {
  const queryClient = useQueryClient();
  const { queryKey } = loopQuery(loopId);
  // A read of the Loop that is in flight can answer after the cancel, with the
  // status from before it. The page must not show that answer.
  const dropReadsInFlight = () => queryClient.cancelQueries({ queryKey });
  return useMutation({
    mutationFn: () => cancelWithTries(() => cancelLoop(loopId)),
    // The default mode holds the call while the browser is offline, and sends
    // it later by itself. With "always", a network failure shows its alert at once.
    networkMode: "always",
    onMutate: dropReadsInFlight,
    onSuccess: async (loop) => {
      // A second time: a read can start between the click and the stop of the poll.
      await dropReadsInFlight();
      queryClient.setQueryData(queryKey, loop);
      void queryClient.invalidateQueries({ queryKey: LOOP_LISTS_KEY });
    },
  });
}
