import { X } from 'lucide-react';
import { createContext, forwardRef, useContext, type ButtonHTMLAttributes, type FormHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AnimateButton,
  AnimateDialog,
  AnimateDialogClose,
  AnimateDialogContent,
  AnimateDialogDescription,
  AnimateDialogOverlay,
  AnimateDialogPortal,
  AnimateDialogTitle,
  AnimateIconButton,
} from '@/components/animate-ui';
import { cn } from './cn';

export function Alert({ variant, dismissible, onClose, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: string; dismissible?: boolean; onClose?: () => void }) {
  const { t } = useTranslation('common');
  const tone = variant === 'danger' || className?.includes('error') || className?.includes('danger') ? 'destructive' : variant === 'warning' || className?.includes('warning') ? 'warning' : 'default';
  return <div {...props} className={cn('rin-ui-notice', className)} data-tone={tone} role={tone === 'destructive' ? 'alert' : props.role || 'status'}>{children}{dismissible ? <AnimateIconButton className="rin-compat-alert-close" icon={<X />} label={t('accessibility.close')} onClick={onClose} /> : null}</div>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; active?: boolean }>(function CompatButton({ variant, size, active, className, ...props }, ref) {
  const mapped = variant?.includes('danger') ? 'destructive' : variant === 'success' || variant === 'primary' ? 'primary' : 'secondary';
  const mappedSize = size === 'sm' || size === 'lg' ? size : 'md';
  return <AnimateButton {...props} ref={ref} className={className} variant={mapped} size={mappedSize} aria-pressed={active || undefined} />;
});

const FormGroupContext = createContext<string | undefined>(undefined);
type ControlProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { as?: 'input' | 'textarea'; rows?: string | number; plaintext?: boolean };
const Control = forwardRef<HTMLInputElement, ControlProps>(function Control({ as, plaintext, className, ...props }, ref) {
  const controlId = useContext(FormGroupContext);
  if (as === 'textarea') return <textarea {...(props as HTMLAttributes<HTMLTextAreaElement>)} id={props.id || controlId} rows={props.rows === undefined ? undefined : Number(props.rows)} className={cn('rin-ui-control', className)} />;
  return <input {...props} id={props.id || controlId} ref={ref} className={cn('rin-ui-control', className)} readOnly={plaintext || props.readOnly} />;
});
type CompatSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: string | number };
const Select = forwardRef<HTMLSelectElement, CompatSelectProps>(function Select({ className, size, ...props }, ref) { return <select {...props} ref={ref} size={typeof size === 'number' ? size : undefined} data-size={typeof size === 'string' ? size : undefined} className={cn('rin-ui-control', className)} />; });
const Group = ({ controlId, className, ...props }: HTMLAttributes<HTMLDivElement> & { controlId?: string }) => <FormGroupContext.Provider value={controlId}><div {...props} className={cn('rin-ui-field', className)} /></FormGroupContext.Provider>;
const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => { const controlId = useContext(FormGroupContext); return <label {...props} htmlFor={props.htmlFor || controlId} className={cn('rin-compat-label', className)} />; };
const Text = ({ className, ...props }: HTMLAttributes<HTMLElement>) => <small {...props} className={cn('rin-ui-help', className)} />;
const Check = ({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) => <label className={cn('rin-ui-check-row', className)}><input {...props} />{label ? <span>{label}</span> : null}</label>;
const Range = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Range({ className, ...props }, ref) { return <input {...props} type="range" ref={ref} className={cn('rin-compat-range', className)} />; });
export const Form = Object.assign(forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(function Form(props, ref) { return <form {...props} ref={ref} />; }), { Control, Select, Group, Label, Text, Check, Range });

export function Spinner({ className, ...props }: HTMLAttributes<HTMLSpanElement> & { animation?: string; size?: string }) { return <span {...props} className={cn('rin-ui-spinner', className)} />; }
export function Container({ fluid, className, ...props }: HTMLAttributes<HTMLDivElement> & { fluid?: boolean }) { return <div {...props} className={cn(fluid ? 'rin-container-fluid' : 'rin-page-grid', className)} />; }

type ModalProps = { show?: boolean; onHide?: () => void; children: ReactNode; className?: string; dialogClassName?: string; size?: string; centered?: boolean; backdrop?: boolean | 'static'; keyboard?: boolean; preserveLayoutDuringMotion?: boolean };
function ModalRoot({ show, onHide, children, className, dialogClassName, keyboard = true, backdrop = true, preserveLayoutDuringMotion = false }: ModalProps) {
  return <AnimateDialog open={Boolean(show)} onOpenChange={(open) => { if (!open) onHide?.(); }}><AnimateDialogPortal><AnimateDialogOverlay className="rin-ui-overlay rin-animate-overlay" /><AnimateDialogContent className={cn('rin-ui-panel rin-ui-dialog', className, dialogClassName)} preserveLayoutDuringMotion={preserveLayoutDuringMotion} onEscapeKeyDown={(event) => { if (!keyboard) event.preventDefault(); }} onPointerDownOutside={(event) => { if (backdrop === 'static' || backdrop === false) event.preventDefault(); }}>{children}</AnimateDialogContent></AnimateDialogPortal></AnimateDialog>;
}
const ModalHeader = ({ closeButton, children, ...props }: HTMLAttributes<HTMLElement> & { closeButton?: boolean }) => {
  const { t } = useTranslation('common');
  return <header {...props}>{children}{closeButton ? <AnimateDialogClose asChild><AnimateIconButton icon={<X />} label={t('accessibility.close')} /></AnimateDialogClose> : null}</header>;
};
const ModalTitle = (props: HTMLAttributes<HTMLHeadingElement>) => <AnimateDialogTitle {...props} />;
const ModalDescription = (props: HTMLAttributes<HTMLParagraphElement>) => <AnimateDialogDescription {...props} />;
const ModalBody = (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />;
const ModalFooter = (props: HTMLAttributes<HTMLElement>) => <footer {...props} />;
export const Modal = Object.assign(ModalRoot, { Header: ModalHeader, Title: ModalTitle, Description: ModalDescription, Body: ModalBody, Footer: ModalFooter });
