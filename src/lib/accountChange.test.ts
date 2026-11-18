import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { watchAccountChange } from "./accountChange";

const account = (id: string) => ({ id, name: id });

function client() {
  const queryClient = new QueryClient();
  const stop = watchAccountChange(queryClient);
  return { queryClient, stop };
}

describe("watchAccountChange", () => {
  it("keeps the data when the first account loads", () => {
    const { queryClient } = client();
    queryClient.setQueryData(["agents"], ["agent of nobody"]);
    queryClient.setQueryData(["me"], account("a"));

    expect(queryClient.getQueryData(["agents"])).toEqual(["agent of nobody"]);
  });

  it("keeps the data when the same account signs in again", () => {
    const { queryClient } = client();
    queryClient.setQueryData(["me"], account("a"));
    queryClient.setQueryData(["agents"], ["agent of a"]);
    queryClient.setQueryData(["me"], account("a"));

    expect(queryClient.getQueryData(["agents"])).toEqual(["agent of a"]);
  });

  it("removes the data of each other query when a different account signs in, and keeps the account", () => {
    const { queryClient } = client();
    queryClient.setQueryData(["me"], account("a"));
    queryClient.setQueryData(["agents"], ["agent of a"]);
    queryClient.setQueryData(["experiments", "agent-1"], ["experiment of a"]);
    queryClient.setQueryData(["me"], account("b"));

    expect(queryClient.getQueryData(["agents"])).toBeUndefined();
    expect(queryClient.getQueryData(["experiments", "agent-1"])).toBeUndefined();
    expect(queryClient.getQueryData(["me"])).toEqual(account("b"));
  });

  it("remembers the account across a sign-out, which removes all the data", () => {
    const { queryClient } = client();
    queryClient.setQueryData(["me"], account("a"));
    queryClient.clear();
    queryClient.setQueryData(["agents"], ["old answer that arrived late"]);
    queryClient.setQueryData(["me"], account("b"));

    expect(queryClient.getQueryData(["agents"])).toBeUndefined();
  });

  it("does nothing for an account query that failed", async () => {
    const { queryClient } = client();
    queryClient.setQueryData(["me"], account("a"));
    queryClient.setQueryData(["agents"], ["agent of a"]);
    await queryClient.fetchQuery({ queryKey: ["me"], queryFn: () => Promise.reject(new Error("no answer")), retry: false }).catch(() => undefined);

    expect(queryClient.getQueryData(["agents"])).toEqual(["agent of a"]);
  });

  it("stops when the watch ends", () => {
    const { queryClient, stop } = client();
    queryClient.setQueryData(["me"], account("a"));
    queryClient.setQueryData(["agents"], ["agent of a"]);
    stop();
    queryClient.setQueryData(["me"], account("b"));

    expect(queryClient.getQueryData(["agents"])).toEqual(["agent of a"]);
  });
});
