import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Crown,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileRecordCard, RecordAction } from "@/components/mobile-record-card";

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
  const { user, isAdmin, isOwner, status, requestPasswordReset } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);

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

  /**
   * Changes the address on the profile *and* on the sign-in account, through a
   * SECURITY DEFINER function — updating tesoro_users alone would leave the
   * person still signing in with the old one.
   */
  const saveEmail = useCallback(async () => {
    if (!editing) return;
    const clean = newEmail.trim().toLowerCase();
    if (clean === editing.email_id.toLowerCase()) {
      setEditing(null);
      return;
    }

    setDialogBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc("admin_update_user_email", {
      _sno: editing.sno,
      _email: clean,
    });
    setDialogBusy(false);

    if (rpcError) {
      toast.error("Could not change the email address", { description: rpcError.message });
      return;
    }
    toast.success("Email address updated", { description: `${editing.email_id} → ${clean}` });
    setEditing(null);
    void load();
  }, [editing, newEmail, load]);

  const sendReset = useCallback(
    async (target: AdminUser) => {
      setBusyId(String(target.sno));
      const res = await requestPasswordReset(target.email_id);
      setBusyId(null);

      if (!res.ok) {
        toast.error("Could not send the reset link", { description: res.error });
        return;
      }
      toast.success("Reset link sent", { description: target.email_id });
    },
    [requestPasswordReset],
  );

  /**
   * Removes the profile row, which is what revokes access: RLS reads approval
   * from it, so the account can no longer see anything. The Supabase Auth login
   * and the person's rows in tesoro_raw both survive — erasing those needs the
   * service key, which the browser deliberately does not hold.
   */
  const deleteUser = useCallback(async () => {
    if (!deleting) return;
    setDialogBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from("tesoro_users")
      .delete()
      .eq("sno", deleting.sno);
    setDialogBusy(false);

    if (deleteError) {
      toast.error("Could not delete the account", { description: deleteError.message });
      return;
    }
    toast.success("Account removed", { description: deleting.email_id });
    setDeleting(null);
    setDeleteConfirm("");
    void load();
  }, [deleting, load]);

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

      {/* Phones get the same accounts as cards — every one of them, rather than
          an eight-column table clipped to whatever fits. */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No accounts match.</p>
        ) : (
          filtered.map((u) => {
            const isSelf = Boolean(u.auth_uid) && u.auth_uid === user?.id;
            const busy = busyId === String(u.sno);
            return (
              <MobileRecordCard
                key={u.sno}
                id={
                  <span className="truncate">
                    {u.user_id || displayName(u)}
                    {isSelf ? <span className="ml-1.5 text-muted-foreground">(you)</span> : null}
                  </span>
                }
                fields={[
                  { label: "Name", value: displayName(u) },
                  {
                    label: "Access",
                    value:
                      u.is_owner || u.is_approved ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                          {u.is_owner ? "Always on" : "Approved"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                          Pending
                        </Badge>
                      ),
                  },
                  {
                    label: "Role",
                    value: u.is_owner ? (
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
                      "User"
                    ),
                  },
                  { label: "Email", value: u.email_id },
                  { label: "Cars", value: u.car_count.toLocaleString() },
                  { label: "Joined", value: formatDate(u.created_at) },
                  { label: "Last seen", value: formatDate(u.last_sign_in) },
                  {
                    label: "Sign-in",
                    value: u.auth_uid ? "Linked" : "Not linked yet",
                  },
                ]}
                actions={
                  u.is_owner ? null : (
                    <>
                      <RecordAction
                        label="Change email address"
                        disabled={busy}
                        onClick={() => {
                          setEditing(u);
                          setNewEmail(u.email_id);
                        }}
                      >
                        <Mail className="size-4" />
                      </RecordAction>
                      <RecordAction
                        label="Send password reset link"
                        disabled={busy}
                        onClick={() => void sendReset(u)}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <KeyRound className="size-4" />
                        )}
                      </RecordAction>
                      {isOwner ? (
                        <RecordAction
                          label="Delete account"
                          tone="destructive"
                          disabled={busy || isSelf}
                          onClick={() => {
                            setDeleting(u);
                            setDeleteConfirm("");
                          }}
                        >
                          <Trash2 className="size-4" />
                        </RecordAction>
                      ) : null}
                    </>
                  )
                }
                footer={
                  u.is_owner ? (
                    <p className="text-xs text-muted-foreground">
                      Owner account — cannot be changed
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={busy || isSelf}
                        onClick={() => void setApproval(u, !u.is_approved)}
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
                        className="flex-1"
                        disabled={busy || isSelf}
                        onClick={() => void setAdminRole(u, !u.is_admin)}
                      >
                        {u.is_admin ? "Revoke admin" : "Make admin"}
                      </Button>
                    </div>
                  )
                }
              />
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
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
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={busy}
                              onClick={() => {
                                setEditing(u);
                                setNewEmail(u.email_id);
                              }}
                              aria-label={`Change email for ${u.email_id}`}
                              title="Change email address"
                            >
                              <Mail className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              disabled={busy}
                              onClick={() => void sendReset(u)}
                              aria-label={`Send password reset link to ${u.email_id}`}
                              title="Send password reset link"
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <KeyRound className="size-3.5" />
                              )}
                            </Button>
                            {/* Deleting an account is the owner's alone. */}
                            {isOwner ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                disabled={busy || isSelf}
                                onClick={() => {
                                  setDeleting(u);
                                  setDeleteConfirm("");
                                }}
                                aria-label={`Delete ${u.email_id}`}
                                title={isSelf ? "You can't delete yourself" : "Delete account"}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
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

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change email address</DialogTitle>
            <DialogDescription>
              This changes the sign-in address too, so {editing ? displayName(editing) : "they"}{" "}
              will use the new one from now on. No confirmation email is sent to either address.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="adminNewEmail">Email</Label>
            <Input
              id="adminNewEmail"
              type="email"
              autoComplete="off"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Currently <span className="text-foreground">{editing?.email_id}</span>
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={dialogBusy}>
              Cancel
            </Button>
            <Button onClick={() => void saveEmail()} disabled={dialogBusy || !newEmail.trim()}>
              {dialogBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteConfirm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this account?</DialogTitle>
            <DialogDescription>
              {deleting ? displayName(deleting) : "This account"} loses access immediately. Their{" "}
              {deleting?.car_count.toLocaleString() ?? 0} cars stay in the database and their
              sign-in still exists — removing those needs the Supabase dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="deleteConfirm">
              Type <span className="font-mono text-foreground">{deleting?.email_id}</span> to
              confirm
            </Label>
            <Input
              id="deleteConfirm"
              autoComplete="off"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleting(null);
                setDeleteConfirm("");
              }}
              disabled={dialogBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteUser()}
              disabled={
                dialogBusy ||
                deleteConfirm.trim().toLowerCase() !== (deleting?.email_id ?? "").toLowerCase()
              }
            >
              {dialogBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
