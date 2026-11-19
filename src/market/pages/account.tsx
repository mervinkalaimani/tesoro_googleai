import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { AddressForm, BLANK_ADDRESS } from "../components/address";
import {
  Card,
  Confirm,
  ErrorNote,
  Field,
  inputCls,
  PageTitle,
  SignInNeeded,
  VerifyPill,
} from "../components/bits";
import { resetDemo } from "../db";
import { api, run, useMarket } from "../use-market";

export function AccountPage() {
  const { s, me } = useMarket();
  const navigate = useNavigate();
  const [name, setName] = useState(me?.name ?? "");
  const [adding, setAdding] = useState(false);
  const [addr, setAddr] = useState(BLANK_ADDRESS);
  const [error, setError] = useState("");
  if (!me) return <SignInNeeded what="manage your account" />;
  const store = s.sellers.find((x) => x.userId === me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title="Account" sub={me.email} />
      <Card className="space-y-3">
        <h2 className="font-medium">Profile</h2>
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button variant="outline" onClick={() => run(api.updateProfile(name), "Saved")}>
          Save name
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Seller mode</h2>
        {store ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{store.storeName}</p>
                <div className="mt-1">
                  <VerifyPill v={store.verification} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Seller tools{" "}
                <Switch
                  checked={me.sellerMode}
                  onCheckedChange={(v) => {
                    run(api.setSellerMode(v));
                  }}
                  aria-label="Seller mode"
                />
              </label>
            </div>
            {store.verification === "Unverified" && (
              <div className="text-sm text-muted-foreground">
                Verification is manual and not available in the demo; requesting it only marks the
                store <b>Pending</b>. Buyers see the real state.
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(api.requestVerification(), "Marked pending")}
                  >
                    Request verification
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link to="/market/sell">Seller dashboard</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/market/sell/setup">Edit store</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Same account, extra tools: list cars, ship orders, host auctions and raffles. Your
              collection and orders stay as they are.
            </p>
            <Button asChild>
              <Link to="/market/sell/setup">Become a seller</Link>
            </Button>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Addresses</h2>
        {!me.addresses.length && (
          <p className="text-sm text-muted-foreground">
            None saved. Your first checkout saves one.
          </p>
        )}
        <ul className="space-y-2">
          {me.addresses.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border p-3 text-sm"
            >
              <span>
                {a.name} · {a.phone}
                <br />
                {a.line1}, {a.city}, {a.state} {a.pincode}
              </span>
              <Confirm
                trigger={(open) => (
                  <button
                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                    onClick={open}
                  >
                    Remove
                  </button>
                )}
                title="Remove address?"
                body="Past orders keep the address they were sent to."
                confirm="Remove"
                danger
                onConfirm={() => run(api.removeAddress(a.id))}
              />
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="space-y-3">
            <AddressForm value={addr} onChange={setAddr} />
            <ErrorNote>{error}</ErrorNote>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const r = api.addAddress(addr);
                  if (r.ok) {
                    setAdding(false);
                    setAddr(BLANK_ADDRESS);
                    setError("");
                  } else setError(r.error);
                }}
              >
                Save address
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            Add address
          </Button>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Notifications</h2>
        {(["orders", "events"] as const).map((k) => (
          <label key={k} className="flex items-center justify-between text-sm">
            {k === "orders"
              ? "Order and shipping updates"
              : "Auction and raffle updates (outbid, results)"}
            <Switch
              checked={me.notify[k]}
              onCheckedChange={(v) => run(api.setNotify(k, v))}
              aria-label={k}
            />
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Delivered in-app (the bell). Email and push aren't connected in the demo.
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            api.signOut();
            void navigate({ to: "/market" });
          }}
        >
          Sign out
        </Button>
        <Confirm
          trigger={(open) => (
            <Button variant="ghost" onClick={open}>
              Reset demo data
            </Button>
          )}
          title="Reset the demo?"
          body="Everything you created in this browser (orders, listings, events, accounts) is erased and the seed data comes back."
          confirm="Reset"
          danger
          onConfirm={() => {
            resetDemo();
            void navigate({ to: "/market" });
          }}
        />
      </div>
    </div>
  );
}
