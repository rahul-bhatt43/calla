"use client";

import { useId, useState } from "react";
import { Camera, Flag, Mic, SkipForward } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  ConnectionPill,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  ToastProvider,
  Tooltip,
  TooltipProvider,
  useToast,
  type ConnectionState,
} from "@callme/ui";

const CONNECTION_STATES: ConnectionState[] = [
  "idle",
  "searching",
  "connecting",
  "connected",
  "relayed",
  "poor",
  "failed",
];

const SURFACE_TOKENS = [
  "--bg",
  "--bg-subtle",
  "--surface",
  "--surface-raised",
  "--surface-sunken",
  "--border",
  "--border-strong",
];
const TEXT_TOKENS = ["--text", "--text-muted", "--text-subtle"];
const ACCENT_TOKENS = [
  "--accent",
  "--accent-hover",
  "--accent-subtle",
  "--success",
  "--warning",
  "--danger",
];

export function DesignSystemShowcase() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="min-h-dvh">
          <header className="border-b border-[var(--border)] px-6 py-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              Design system
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Every component, every state. Dev only.
            </p>
          </header>

          {/* Both themes rendered side by side. A token that only resolves in
              one of them is invisible until you look at them together. */}
          <div className="grid lg:grid-cols-2">
            <ThemePanel theme="dark" />
            <ThemePanel theme="light" />
          </div>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}

function ThemePanel({ theme }: { theme: "dark" | "light" }) {
  return (
    <div
      data-theme={theme}
      className="border-b border-[var(--border)] bg-[var(--bg)] p-6 text-[var(--text)] lg:border-b-0 lg:[&:first-child]:border-r"
    >
      <Badge tone="accent">{theme}</Badge>
      <div className="mt-6 space-y-10">
        <Tokens />
        <Buttons />
        <Inputs />
        <Feedback />
        <Overlays />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tokens() {
  return (
    <Section title="Tokens">
      <div className="space-y-3">
        {[SURFACE_TOKENS, TEXT_TOKENS, ACCENT_TOKENS].map((group, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            {group.map((token) => (
              <div key={token} className="w-24">
                <div
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)]"
                  style={{ background: `var(${token})` }}
                />
                <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-subtle)]">
                  {token}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Buttons() {
  return (
    <Section title="Buttons">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["primary", "secondary", "outline", "ghost", "danger", "success"] as const).map(
            (v) => (
              <Button key={v} variant={v}>
                {v}
              </Button>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">small</Button>
          <Button size="md">medium</Button>
          <Button size="lg">large</Button>
          <Button size="icon" aria-label="Mic">
            <Mic />
          </Button>
          <Button size="icon-lg" pill variant="secondary" aria-label="Skip">
            <SkipForward />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button loading>loading</Button>
          <Button disabled>disabled</Button>
          <Button variant="link">link style</Button>
        </div>
      </div>
    </Section>
  );
}

function Inputs() {
  const [on, setOn] = useState(true);
  // Both theme panels render this same block, so the ids must not collide —
  // duplicate ids would break every label's association with its control.
  const uid = useId();

  return (
    <Section title="Inputs">
      <div className="max-w-sm space-y-4">
        <Field label="Username" htmlFor={`${uid}-user`} hint="3–24 characters">
          <Input placeholder="swift-otter" />
        </Field>

        <Field
          label="Username"
          htmlFor={`${uid}-error`}
          error="That username is taken"
          required
        >
          <Input defaultValue="taken" />
        </Field>

        <Field label="Note" htmlFor={`${uid}-note`}>
          <Textarea placeholder="What happened?" />
        </Field>

        <Select defaultValue="video">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="video">Video chat</SelectItem>
            <SelectItem value="text">Text only</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-3 text-sm">
          <Switch checked={on} onCheckedChange={setOn} />
          Blur explicit video automatically
        </label>

        <Tabs defaultValue="video">
          <TabsList>
            <TabsTrigger value="video">Video</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </Section>
  );
}

function Feedback() {
  return (
    <Section title="Feedback">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["neutral", "accent", "success", "warning", "danger"] as const).map(
            (tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ),
          )}
        </div>

        {/* Every connection state at once. These are the strings a user reads
            when something goes wrong, so seeing them together keeps the
            wording consistent. */}
        <div className="flex flex-wrap gap-2">
          {CONNECTION_STATES.map((s) => (
            <ConnectionPill key={s} state={s} />
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Spinner />
          <Avatar name="swift-otter-42" size={40} />
          <Avatar name="quiet-heron-19" size={32} />
          <Avatar name="bold-lynx-7" size={24} />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>

        <Card interactive className="max-w-sm">
          <CardHeader>
            <CardTitle>Interactive card</CardTitle>
            <CardDescription>Lifts on hover.</CardDescription>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-[var(--text-muted)]">Body content.</p>
          </CardBody>
        </Card>
      </div>
    </Section>
  );
}

function Overlays() {
  const { toast } = useToast();

  return (
    <Section title="Overlays">
      <div className="flex flex-wrap gap-2">
        <Tooltip content="Report this person">
          <Button variant="ghost" size="icon" aria-label="Report">
            <Flag />
          </Button>
        </Tooltip>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Report this person</DialogTitle>
            <DialogDescription>
              You&rsquo;ll be disconnected and never matched with them again.
            </DialogDescription>
            <DialogFooter>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {(["info", "success", "warning", "danger"] as const).map((tone) => (
          <Button
            key={tone}
            variant="outline"
            size="sm"
            onClick={() =>
              toast({
                title: `${tone} toast`,
                description: "With a supporting line of detail.",
                tone,
              })
            }
          >
            <Camera />
            {tone}
          </Button>
        ))}
      </div>
    </Section>
  );
}
