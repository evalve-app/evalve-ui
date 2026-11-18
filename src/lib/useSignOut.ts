import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "../api/client";

// Signs the person out: ends the sign-in on the server, removes the data of
// the account from memory, and opens the login page. The account menu and the
// "Sign in again" dialog use it. The last two steps occur also when the server
// does not answer, so that the page of the account does not stay open.
export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await logout();
    } finally {
      queryClient.clear();
      navigate("/login", { replace: true });
    }
  }, [navigate, queryClient]);
}
