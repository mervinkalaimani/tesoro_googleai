import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { Card, ErrorNote, Field, inputCls } from "../components/bits";
import { api, useMarket } from "../use-market";

export function SignInPage() {
  const { s, me } = useMarket();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const done = () => void navigate({ to: "/market" });

  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
      <Card>
        <h1 className="text-lg font-semibold">Try a demo account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Demo sign-in: there are no passwords here. Production should use real authentication (the
          host app already has Supabase Auth). Each account is both buyer and seller.
        </p>
        <ul className="mt-3 space-y-2">
          {s.users
            .filter((u) => u.demo)
            .map((u) => {
              const store = s.sellers.find((x) => x.userId === u.id);
              return (
                <li key={u.id}>
                  <button
                    className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      api.signIn(u.id);
                      done();
                    }}
                  >
                    <span>
                      <b>{u.name}</b>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {store
                          ? `Seller · ${store.storeName}`
                          : "Collector with an order in transit"}
                      </span>
                    </span>
                    {me?.id === u.id && <span className="text-xs text-primary">Signed in</span>}
                  </button>
                </li>
              );
            })}
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Create a demo account</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const r = api.signUp(name, email);
            if (r.ok) done();
            else setError(r.error);
          }}
        >
          <Field label="Name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" className="w-full">
            Create account
          </Button>
          <p className="text-xs text-muted-foreground">
            Stored only in this browser. You can become a seller later from your account.
          </p>
        </form>
      </Card>
    </div>
  );
}
