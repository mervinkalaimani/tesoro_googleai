import { useEffect, useState } from "react";
import { Mail, Pencil, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-store";
import {
  HELP_TITLES,
  saveHelpDoc,
  useHelpContent,
  type HelpContent,
  type HelpDocKey,
} from "@/lib/help-content";

/**
 * Enough of Markdown for a policy: a heading, a paragraph, a bulleted list.
 *
 * A whole Markdown dependency to render three shapes would be a strange trade,
 * and a raw HTML field that the owner can type into would be a stranger one —
 * this way the worst somebody can publish is badly-spaced prose.
 */
function DocBody({ text }: { text: string }) {
  // A heading ends its block whether or not a blank line follows it. Without
  // this, "## What is stored" and the paragraph under it are one block, and
  // the whole paragraph renders as the heading.
  const blocks = text
    .trim()
    .replace(/^(##\s.*)$/gm, "$1\n")
    .split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={i}
              className="pt-2 text-[15px] font-semibold tracking-tight text-foreground first:pt-0"
            >
              {trimmed.slice(3).trim()}
            </h3>
          );
        }

        const lines = trimmed.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {lines.map((l, j) => (
                <li key={j}>{l.trim().slice(2).trim()}</li>
              ))}
            </ul>
          );
        }

        // Single newlines inside a paragraph are where the text was wrapped,
        // not where a line break was wanted.
        return (
          <p key={i} className="text-sm leading-relaxed text-muted-foreground">
            {lines.map((l) => l.trim()).join(" ")}
          </p>
        );
      })}
    </div>
  );
}

function ContactRow({
  icon: Icon,
  href,
  children,
}: {
  icon: typeof Phone;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 active:bg-muted/50"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-[15px] font-medium text-primary">{children}</span>
    </a>
  );
}

/**
 * One Help document, read by everybody and edited by the owner. Saving writes
 * it straight to the shared row, so it is published the moment it is saved.
 */
export function HelpDoc({ docKey }: { docKey: HelpDocKey }) {
  const { isOwner } = useAuth();
  const { content, loaded, reload } = useHelpContent();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Pick<HelpContent, "phone" | "email"> & { body: string }>({
    phone: "",
    email: "",
    body: "",
  });
  const [saving, setSaving] = useState(false);

  // While the text is still arriving, an open editor would be typing over a
  // draft seeded from the defaults. Reseed whenever the source changes.
  useEffect(() => {
    if (editing) return;
    setDraft({ phone: content.phone, email: content.email, body: content[docKey] });
  }, [content, docKey, editing]);

  const isContact = docKey === "contact";

  const save = async () => {
    setSaving(true);
    const res = await saveHelpDoc(docKey, {
      body: draft.body,
      phone: draft.phone.trim(),
      email: draft.email.trim(),
    });
    setSaving(false);

    if (res.error) {
      toast.error("Could not publish", { description: res.error });
      return;
    }
    await reload();
    setEditing(false);
    toast.success(`${HELP_TITLES[docKey]} published`, {
      description: "Everyone sees the new version from now on.",
    });
  };

  if (editing) {
    return (
      <div className="space-y-4">
        {isContact && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="px-1 text-xs font-medium text-muted-foreground" htmlFor="help-phone">
                Phone
              </label>
              <Input
                id="help-phone"
                type="tel"
                inputMode="tel"
                placeholder="+91 98765 43210"
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="px-1 text-xs font-medium text-muted-foreground" htmlFor="help-email">
                Email
              </label>
              <Input
                id="help-email"
                type="email"
                inputMode="email"
                placeholder="hello@example.com"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="px-1 text-xs font-medium text-muted-foreground" htmlFor="help-body">
            {HELP_TITLES[docKey]}
          </label>
          <Textarea
            id="help-body"
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            className="min-h-[360px] font-mono text-xs leading-relaxed"
            spellCheck
          />
          <p className="px-1 text-[11px] text-muted-foreground">
            A line starting <code className="font-mono">##</code> is a heading, a line starting{" "}
            <code className="font-mono">-</code> is a bullet, and a blank line starts a new
            paragraph.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setDraft({ phone: content.phone, email: content.email, body: content[docKey] });
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !draft.body.trim()}>
            {saving ? "Publishing…" : "Save & publish"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isContact && (content.phone || content.email) && (
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
          {content.phone && (
            <ContactRow icon={Phone} href={`tel:${content.phone.replace(/\s+/g, "")}`}>
              {content.phone}
            </ContactRow>
          )}
          {content.email && (
            <ContactRow icon={Mail} href={`mailto:${content.email}`}>
              {content.email}
            </ContactRow>
          )}
        </div>
      )}

      {isContact && loaded && !content.phone && !content.email && (
        <p className="rounded-xl border border-dashed border-border/80 px-4 py-3 text-xs text-muted-foreground">
          {isOwner
            ? "No phone or email set yet — add them with Edit, and they appear here for everybody."
            : "No contact details have been published yet."}
        </p>
      )}

      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        <DocBody text={content[docKey]} />
      </div>

      {isOwner && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      )}
    </div>
  );
}
