import { accountProfileSchema } from "@Alumni-Tracking-Ss/api/validation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AccountProfileFields } from "@/components/account-profile-fields";
import { PrimaryButton } from "@/components/page-header";
import { client, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/complete-profile")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery(context.orpc.auth.me.queryOptions());
    if (!user) throw redirect({ to: "/login" });
    if (!user.needsProfileCompletion) throw redirect({ to: "/dashboard" });
  },
  component: CompleteProfile,
});

function CompleteProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ phoneNumber: "", gender: "", facebookAccount: "" });
  const save = useMutation({
    mutationFn: () => client.auth.completeProfile(accountProfileSchema.parse(profile)),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      await navigate({ to: "/dashboard" });
    },
  });
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete your account</CardTitle>
          <CardDescription>
            Your Google account is connected. Add your contact details to finish signing up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <AccountProfileFields value={profile} onChange={setProfile} />
            {save.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {save.error.message}
              </p>
            ) : null}
            <PrimaryButton type="submit" pending={save.isPending}>
              Finish signup
            </PrimaryButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
