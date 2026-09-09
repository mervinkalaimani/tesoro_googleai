import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Crown,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type AdminUser = {
  sno: number;
  user_id: string | null;
  auth_uid: string | null;
  first_name: string;
  last_name: string | null;
  email_id: string;
  dob: string | null;
  is_admin: boolean;
  is_approved: boolean;
  is_owner: boolean;
  created_at: string;
  car_count: number;
  last_sign_in: string | null;
};

function displayName(u: AdminUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "—";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function AdminPage() {
  const { user, isAdmin, status } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcError } = await (supabase as any).rpc("admin_list_users");
    if (rpcError) {
      setError(rpcError.message);
      setUsers([]);
    } else {
      setUsers((data ?? []) as AdminUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin, load]);

  const setApproval = useCallback(
    async (target: AdminUser, approved: boolean) => {
      setBusyId(String(target.sno));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("tesoro_users")
        .update({ is_approved: approved })
        .eq("sno", target.sno);
      setBusyId(null);

      if (updateError) {
        toast.error(`Could not update ${target.email_id}`, {
          description: updateError.message,
        });
        return;
      }
      toast.success(approved ? "Access granted" : "Access suspended", {
        description: target.email_id,
      });
      void load();
    },
    [load],
  );

  const setAdminRole = useCallback(
    async (target: AdminUser, makeAdmin: boolean) => {
      setBusyId(String(target.sno));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: roleError } = await (supabase as any)
        .from("tesoro_users")
        // Promoting also approves: an admin who cannot sign in is useless.
        .update(makeAdmin ? { is_admin: true, is_approved: true } : { is_admin: false })
        .eq("sno", target.sno);
      setBusyId(null);

      if (roleError) {
        toast.error("Could not change role", { description: roleError.message });
        return;
      }
      toast.success(makeAdmin ? "Promoted to admin" : "Admin revoked", {
        description: target.email_id,
      });
      void load();
    },
    [load],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email_id.toLowerCase().includes(q) ||
        displayName(u).toLowerCase().includes(q) ||
        (u.user_id ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const pendingCount = useMemo(
    () => users.filter((u) => !u.is_approved && !u.is_owner).length,
    [users],
  );

  if (status !== "ready") return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="text-display mt-5 text-xl font-semibold tracking-tight">Admins only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page manages who can use Tesoro. Your account doesn't have the admin role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {users.length} {users.length === 1 ? "account" : "accounts"}
            {pendingCount > 0 ? ` · ${pendingCount} awaiting approval` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Reload">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <div className="mt-1 text-xs text-destructive/80">
            If this mentions a missing function, the auth migration hasn't been applied to Supabase
            yet.
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>User ID</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Cars</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No accounts match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const isSelf = Boolean(u.auth_uid) && u.auth_uid === user?.id;
                const busy = busyId === String(u.sno);
                return (
                  <TableRow key={u.sno}>
                    <TableCell>
                      <div className="font-medium">
                        {displayName(u)}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email_id}</div>
                      {!u.auth_uid ? (
                        <div className="text-xs text-amber-500">Not linked to a sign-in yet</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {u.user_id ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{u.user_id}</code>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_owner || u.is_approved ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                          {u.is_owner ? "Always on" : "Approved"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_owner ? (
                        <Badge className="gap-1">
                          <Crown className="size-3" />
                          Owner
                        </Badge>
                      ) : u.is_admin ? (
                        <Badge className="gap-1">
                          <ShieldCheck className="size-3" />
                          Admin
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">User</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.car_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(u.last_sign_in)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {u.is_owner ? (
                          <span className="text-xs text-muted-foreground">
                            Owner account — cannot be changed
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || isSelf}
                              onClick={() => void setApproval(u, !u.is_approved)}
                              title={isSelf ? "You can't change your own access" : undefined}
                            >
                              {u.is_approved ? (
                                <>
                                  <UserX className="size-3.5" />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <UserCheck className="size-3.5" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy || isSelf}
                              onClick={() => void setAdminRole(u, !u.is_admin)}
                              title={isSelf ? "You can't change your own role" : undefined}
                            >
                              {u.is_admin ? "Revoke admin" : "Make admin"}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Suspending an account blocks it at the database level, not just in the UI — its rows become
        unreadable immediately, even through the API. Collections are never deleted by these
        actions.
      </p>
    </div>
  );
}
