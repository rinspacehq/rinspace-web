import { Slot } from "@radix-ui/react-slot";
import { XIcon } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TableHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useTranslation } from "react-i18next";

import { cn } from "./cn";
import {
  AnimateAccordion,
  AnimateAccordionContent,
  AnimateAccordionItem,
  AnimateAccordionTrigger,
  AnimateButton,
  AnimateCheckbox,
  AnimateDialog,
  AnimateDialogClose,
  AnimateDialogContent,
  AnimateDialogDescription,
  AnimateDialogOverlay,
  AnimateDialogPortal,
  AnimateDialogTitle,
  AnimateDialogTrigger,
  AnimateDropdownMenu,
  AnimateDropdownMenuContent,
  AnimateDropdownMenuGroup,
  AnimateDropdownMenuItem,
  AnimateDropdownMenuLabel,
  AnimateDropdownMenuPortal,
  AnimateDropdownMenuSeparator,
  AnimateDropdownMenuSub,
  AnimateDropdownMenuSubContent,
  AnimateDropdownMenuSubTrigger,
  AnimateDropdownMenuTrigger,
  AnimatePopover,
  AnimatePopoverContent,
  AnimatePopoverPortal,
  AnimatePopoverTrigger,
  AnimateSheet,
  AnimateSheetClose,
  AnimateSheetContent,
  AnimateSheetDescription,
  AnimateSheetOverlay,
  AnimateSheetPortal,
  AnimateSheetTitle,
  AnimateSheetTrigger,
  AnimateSwitch,
  AnimateTabs,
  AnimateTabsContent,
  AnimateTabsList,
  AnimateTabsTrigger,
  AnimateTooltip,
  AnimateTooltipContent,
  AnimateTooltipPortal,
  AnimateTooltipProvider,
  AnimateTooltipTrigger,
} from "@/components/animate-ui";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  pending?: boolean;
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      asChild,
      pending,
      variant = "secondary",
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) {
    if (asChild)
      return (
        <Slot
          {...props}
          ref={ref}
          className={cn("rin-ui-button", className)}
          data-variant={variant}
          aria-busy={pending || undefined}
          aria-disabled={disabled || pending || undefined}
        >
          {children}
        </Slot>
      );
    return (
      <AnimateButton
        {...props}
        ref={ref}
        className={className}
        disabled={disabled || pending}
        variant={variant === "destructive" ? "destructive" : variant}
        aria-busy={pending || undefined}
      >
        {pending ? (
          <span className="rin-ui-spinner" aria-hidden="true" />
        ) : null}
        {children}
      </AnimateButton>
    );
  },
);

export const Link = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function Link({ className, ...props }, ref) {
  return <a {...props} ref={ref} className={cn("rin-ui-link", className)} />;
});

type FieldProps = {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (ids: {
    inputId: string;
    descriptionId?: string;
    errorId?: string;
  }) => ReactNode;
};

export function Field({ label, help, error, required, children }: FieldProps) {
  const id = useId();
  const descriptionId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="rin-ui-field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ inputId: id, descriptionId, errorId })}
      {help ? (
        <div id={descriptionId} className="rin-ui-help">
          {help}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} className="rin-ui-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input {...props} ref={ref} className={cn("rin-ui-control", className)} />
  );
});
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={cn("rin-ui-control", className)}
    />
  );
});
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select {...props} ref={ref} className={cn("rin-ui-control", className)} />
  );
});

export const Checkbox = AnimateCheckbox;

export const Switch = AnimateSwitch;

export const Menu = AnimateDropdownMenu;
export const MenuTrigger = AnimateDropdownMenuTrigger;
export const MenuSub = AnimateDropdownMenuSub;
export const MenuSubTrigger = AnimateDropdownMenuSubTrigger;
export const MenuSubContent = AnimateDropdownMenuSubContent;
export const MenuGroup = AnimateDropdownMenuGroup;
export const MenuLabel = AnimateDropdownMenuLabel;
export const MenuSeparator = AnimateDropdownMenuSeparator;
export function MenuContent({
  className,
  ...props
}: ComponentProps<typeof AnimateDropdownMenuContent>) {
  return (
    <AnimateDropdownMenuPortal>
      <AnimateDropdownMenuContent
        {...props}
        className={cn("rin-ui-panel rin-ui-menu", className)}
      />
    </AnimateDropdownMenuPortal>
  );
}
export function MenuItem({
  className,
  ...props
}: ComponentProps<typeof AnimateDropdownMenuItem>) {
  return (
    <AnimateDropdownMenuItem
      {...props}
      className={cn("rin-ui-menu-item", className)}
    />
  );
}

export const Popover = AnimatePopover;
export const PopoverTrigger = AnimatePopoverTrigger;
export function PopoverContent({
  className,
  ...props
}: ComponentProps<typeof AnimatePopoverContent>) {
  const { t } = useTranslation("common");
  const accessibleName =
    props["aria-label"] || props["aria-labelledby"]
      ? {}
      : { "aria-label": t("accessibility.popoverContent") };
  return (
    <AnimatePopoverPortal>
      <AnimatePopoverContent
        sideOffset={8}
        {...accessibleName}
        {...props}
        className={cn("rin-ui-panel", className)}
      />
    </AnimatePopoverPortal>
  );
}

export function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  return (
    <AnimateTooltipProvider delayDuration={300}>
      <AnimateTooltip>
        <AnimateTooltipTrigger asChild>{children}</AnimateTooltipTrigger>
        <AnimateTooltipPortal>
          <AnimateTooltipContent
            sideOffset={6}
            className="rin-ui-panel rin-ui-tooltip"
          >
            {content}
          </AnimateTooltipContent>
        </AnimateTooltipPortal>
      </AnimateTooltip>
    </AnimateTooltipProvider>
  );
}

export const Dialog = AnimateDialog;
export const DialogTrigger = AnimateDialogTrigger;
export const DialogPortal = AnimateDialogPortal;
export const DialogOverlay = AnimateDialogOverlay;
export const DialogTitle = AnimateDialogTitle;
export const DialogDescription = AnimateDialogDescription;
export const DialogClose = AnimateDialogClose;
export const DialogBody = AnimateDialogContent;
export function DialogContent({
  title,
  description,
  headerActions,
  children,
  className,
  showCloseButton = true,
}: {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation("common");
  const descriptionProps = description ? {} : { "aria-describedby": undefined };
  return (
    <AnimateDialogPortal>
      <AnimateDialogOverlay className="rin-ui-overlay" />
      <AnimateDialogContent
        className={cn("rin-ui-panel rin-ui-dialog", className)}
        {...descriptionProps}
      >
        <div className="rin-ui-dialog-heading" data-slot="dialog-header">
          <div className="rin-ui-dialog-heading-copy">
            <AnimateDialogTitle className="rin-editorial-title">
              {title}
            </AnimateDialogTitle>
            {description ? (
              <AnimateDialogDescription className="rin-ui-help">
                {description}
              </AnimateDialogDescription>
            ) : null}
          </div>
          {headerActions ? (
            <div className="rin-ui-dialog-heading-actions">
              {headerActions}
            </div>
          ) : null}
        </div>
        {children}
        {showCloseButton ? (
          <AnimateDialogClose className="rin-ui-dialog-close" aria-label={t("accessibility.close")}>
            <XIcon aria-hidden="true" focusable="false" />
          </AnimateDialogClose>
        ) : null}
      </AnimateDialogContent>
    </AnimateDialogPortal>
  );
}

export const Sheet = AnimateSheet;
export const SheetTrigger = AnimateSheetTrigger;
export const SheetClose = AnimateSheetClose;
export function SheetContent({
  title,
  description,
  headerActions,
  children,
  className,
  side,
  showCloseButton = true,
  ...props
}: {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  side?: ComponentProps<typeof AnimateSheetContent>["side"];
  showCloseButton?: boolean;
} & Omit<
  ComponentProps<typeof AnimateSheetContent>,
  "children" | "className" | "side" | "title"
>) {
  const { t } = useTranslation("common");
  const descriptionProps = description ? {} : { "aria-describedby": undefined };
  return (
    <AnimateSheetPortal>
      <AnimateSheetOverlay className="rin-ui-overlay" />
      <AnimateSheetContent
        {...descriptionProps}
        {...props}
        side={side}
        className={cn("rin-ui-panel rin-ui-sheet", className)}
      >
        <div className="rin-ui-dialog-heading" data-slot="sheet-header">
          <div className="rin-ui-dialog-heading-copy">
            <AnimateSheetTitle className="rin-editorial-title">
              {title}
            </AnimateSheetTitle>
            {description ? (
              <AnimateSheetDescription className="rin-ui-help">
                {description}
              </AnimateSheetDescription>
            ) : null}
          </div>
          {headerActions ? (
            <div className="rin-ui-dialog-heading-actions">
              {headerActions}
            </div>
          ) : null}
        </div>
        {children}
        {showCloseButton ? (
          <AnimateSheetClose className="rin-ui-dialog-close" aria-label={t("accessibility.close")}>
            <XIcon aria-hidden="true" focusable="false" />
          </AnimateSheetClose>
        ) : null}
      </AnimateSheetContent>
    </AnimateSheetPortal>
  );
}

export const Tabs = AnimateTabs;
export const TabsList = AnimateTabsList;
export const TabsTrigger = AnimateTabsTrigger;
export const TabsContent = AnimateTabsContent;

export const Accordion = AnimateAccordion;
export const AccordionItem = AnimateAccordionItem;
export const AccordionTrigger = AnimateAccordionTrigger;
export const AccordionContent = AnimateAccordionContent;

export function Command({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  label?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const listboxId = useId();
  const resolvedLabel = label || t("accessibility.command");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={resolvedLabel}>
        <Input
          autoFocus
          role="combobox"
          aria-label={t("accessibility.commandSearch", { label: resolvedLabel })}
          aria-expanded={open}
          aria-controls={listboxId}
        />
        <div id={listboxId} role="listbox">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ToastMessage = {
  id: number;
  title: string;
  tone?: "default" | "destructive";
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};
const ToastContext = createContext<{
  notify(message: Omit<ToastMessage, "id">): void;
} | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextMessageId = useRef(0);
  const dismiss = useCallback((id: number) => {
    setMessages((current) => current.filter((item) => item.id !== id));
  }, []);
  const notify = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = ++nextMessageId.current;
    setMessages((current) => [...current, { ...message, id }]);
    window.setTimeout(
      () => dismiss(id),
      message.durationMs ?? 4000,
    );
  }, [dismiss]);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="rin-ui-toast-region"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.map((message) => (
          <div
            className="rin-ui-panel rin-ui-toast"
            data-tone={message.tone}
            key={message.id}
          >
            <span>{message.title}</span>
            {message.actionLabel && message.onAction ? (
              <button
                className="rin-ui-toast-action"
                type="button"
                onClick={() => {
                  dismiss(message.id);
                  message.onAction?.();
                }}
              >
                {message.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value;
}

// Routes transient status/error/notice states to the shared bottom-left toast region.
export function useNoticeToasts(
  notices: Record<string, string | undefined | null>,
) {
  const toast = useToast();
  const seenRef = useRef<Record<string, string>>({});
  const snapshot = Object.entries(notices)
    .map(([key, value]) => `${key}=${value || ""}`)
    .join("||");
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    if (snapshotRef.current === snapshot) return;
    snapshotRef.current = snapshot;
    for (const [key, value] of Object.entries(notices)) {
      const text = (value || "").trim();
      if (!text || text === seenRef.current[key]) continue;
      seenRef.current[key] = text;
      const destructive = /error|failure|failed|invalid/i.test(key);
      toast.notify({
        title: text,
        tone: destructive ? "destructive" : "default",
      });
    }
  }, [snapshot, notices, toast]);
}

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="rin-ui-table-scroll" tabIndex={0}>
      <table {...props} className={cn("rin-ui-table", className)} />
    </div>
  );
}
export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange(page: number): void;
}) {
  const { t } = useTranslation("common");
  return (
    <nav className="rin-ui-pagination" aria-label={t("accessibility.pagination")}>
      <Button onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        {t("pagination.previous")}
      </Button>
      <span aria-live="polite">
        {t("pagination.position", { page, pageCount })}
      </span>
      <Button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        {t("pagination.next")}
      </Button>
    </nav>
  );
}
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("rin-ui-skeleton", className)}
      aria-hidden="true"
    />
  );
}
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "destructive";
export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={cn("rin-ui-badge", className)}
      data-tone={tone}
    />
  );
}
export const Surface = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function Surface({ className, ...props }, ref) {
  return (
    <div {...props} ref={ref} className={cn("rin-ui-surface", className)} />
  );
});
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rin-ui-empty-state", className)} role="status">
      <strong>{title}</strong>
      {description ? <div className="rin-ui-help">{description}</div> : null}
      {action ? <div className="rin-action-cluster">{action}</div> : null}
    </div>
  );
}
export function SegmentedControl<T extends string>({
  label,
  value,
  items,
  onValueChange,
  className,
}: {
  label: string;
  value: T;
  items: ReadonlyArray<Readonly<{ value: T; label: ReactNode; disabled?: boolean }>>;
  onValueChange(value: T): void;
  className?: string;
}) {
  return (
    <div className={cn("rin-ui-segmented", className)} role="group" aria-label={label}>
      {items.map((item) => (
        <AnimateButton
          unstyled
          aria-pressed={item.value === value}
          className="rin-ui-segmented-item"
          disabled={item.disabled}
          key={item.value}
          onClick={() => onValueChange(item.value)}
          type="button"
        >
          {item.label}
        </AnimateButton>
      ))}
    </div>
  );
}
export function Notice({
  tone = "default",
  title,
  children,
}: {
  tone?: "default" | "warning" | "destructive";
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rin-ui-notice"
      data-tone={tone}
      role={tone === "destructive" ? "alert" : "status"}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}
