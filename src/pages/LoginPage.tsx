import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card, EvalveLogo } from "../design-system/components";
import { SignInForm } from "./SignInForm";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  // Only follow relative paths, so a crafted link can't send you to another site.
  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/agents";

  async function onSignedIn() {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate(next, { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <EvalveLogo height={24} />
        <Card title="Sign in" description="Use your Kitaru server account.">
          <SignInForm onSignedIn={onSignedIn} />
        </Card>
      </div>
    </div>
  );
}
