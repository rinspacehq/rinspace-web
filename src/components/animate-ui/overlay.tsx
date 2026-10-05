import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AnimatePresence, motion, useMotionValue, useSpring, type HTMLMotionProps, type MotionValue, type SpringOptions } from 'motion/react';
import { useCallback, useState, type ComponentProps, type MouseEvent } from 'react';

import { getStrictContext } from './strict-context';

/**
 * Animated overlay primitives adapted from the pinned Animate UI radix catalog.
 * The upstream components are headless (data-slot + Motion); styling lives in
 * `styles/animate-ui.css` keyed by data-slot attributes and `rin-*` tokens.
 * Source basis: `primitives/radix/{dialog,dropdown-menu,popover,tooltip,sheet}`.
 */

type ControlledOpen = { open?: boolean; defaultOpen?: boolean; onOpenChange?(open: boolean): void };

function useOpenState(props: ControlledOpen) {
  const [uncontrolled, setUncontrolled] = useState(props.defaultOpen ?? false);
  const open = props.open ?? uncontrolled;
  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next);
      props.onOpenChange?.(next);
    },
    [props.onOpenChange],
  );
  return [open, setOpen] as const;
}

const [DialogProvider, useDialog] = getStrictContext<{ isOpen: boolean }>('AnimateDialog');
const [DropdownProvider, useDropdown] = getStrictContext<{ isOpen: boolean }>('AnimateDropdownMenu');
const [DropdownSubProvider, useDropdownSub] = getStrictContext<{ isOpen: boolean }>('AnimateDropdownMenuSub');
const [PopoverProvider, usePopover] = getStrictContext<{ isOpen: boolean }>('AnimatePopover');
const [TooltipProvider, useTooltip] = getStrictContext<{ isOpen: boolean; x: MotionValue<number>; y: MotionValue<number>; followCursor?: boolean | 'x' | 'y'; spring?: SpringOptions }>('AnimateTooltip');
const [SheetProvider, useSheet] = getStrictContext<{ isOpen: boolean }>('AnimateSheet');

const rinSpring = { type: 'spring' as const, stiffness: 300, damping: 25 };
const rinFlipSpring = { type: 'spring' as const, stiffness: 150, damping: 25 };

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export type AnimateDialogProps = ComponentProps<typeof DialogPrimitive.Root>;

export function AnimateDialog(props: AnimateDialogProps) {
  const [isOpen, setIsOpen] = useOpenState(props);
  return (
    <DialogProvider value={{ isOpen }}>
      <DialogPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </DialogProvider>
  );
}

export const AnimateDialogTrigger = DialogPrimitive.Trigger;
export const AnimateDialogClose = DialogPrimitive.Close;

export function AnimateDialogPortal({ children, ...props }: ComponentProps<typeof DialogPrimitive.Portal>) {
  const { isOpen } = useDialog();
  return (
    <AnimatePresence>
      {isOpen ? (
        <DialogPrimitive.Portal forceMount {...props}>
          {children}
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AnimateDialogOverlay(props: HTMLMotionProps<'div'>) {
  return (
    <DialogPrimitive.Overlay asChild forceMount>
      <motion.div
        data-slot="dialog-overlay"
        initial={{ opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, filter: 'blur(4px)' }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

type DialogFlipDirection = 'top' | 'bottom' | 'left' | 'right';

export function AnimateDialogContent({
  from = 'top',
  preserveLayoutDuringMotion = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  onFocusOutside,
  transition = rinFlipSpring,
  ...props
}: HTMLMotionProps<'div'> & {
  from?: DialogFlipDirection;
  preserveLayoutDuringMotion?: boolean;
  onOpenAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>['onOpenAutoFocus'];
  onCloseAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>['onCloseAutoFocus'];
  onEscapeKeyDown?: ComponentProps<typeof DialogPrimitive.Content>['onEscapeKeyDown'];
  onPointerDownOutside?: ComponentProps<typeof DialogPrimitive.Content>['onPointerDownOutside'];
  onInteractOutside?: ComponentProps<typeof DialogPrimitive.Content>['onInteractOutside'];
  onFocusOutside?: ComponentProps<typeof DialogPrimitive.Content>['onFocusOutside'];
  transition?: HTMLMotionProps<'div'>['transition'];
}) {
  const initialRotation = from === 'bottom' || from === 'left' ? '20deg' : '-20deg';
  const isVertical = from === 'top' || from === 'bottom';
  const rotateAxis = isVertical ? 'rotateX' : 'rotateY';
  const flip = (deg: string, scale: string) => `perspective(500px) ${rotateAxis}(${deg}) scale(${scale})`;
  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
      onFocusOutside={onFocusOutside}
    >
      <motion.div
        data-slot="dialog-content"
        data-rin-stable-layout={preserveLayoutDuringMotion ? 'true' : undefined}
        initial={preserveLayoutDuringMotion
          ? { opacity: 0, filter: 'blur(4px)' }
          : { opacity: 0, filter: 'blur(4px)', transform: flip(initialRotation, '0.8') }}
        animate={preserveLayoutDuringMotion
          ? { opacity: 1, filter: 'blur(0px)' }
          : { opacity: 1, filter: 'blur(0px)', transform: flip('0deg', '1') }}
        exit={preserveLayoutDuringMotion
          ? { opacity: 0, filter: 'blur(4px)' }
          : { opacity: 0, filter: 'blur(4px)', transform: flip(initialRotation, '0.8') }}
        transition={transition}
        {...props}
      />
    </DialogPrimitive.Content>
  );
}

export const AnimateDialogTitle = DialogPrimitive.Title;
export const AnimateDialogDescription = DialogPrimitive.Description;
export function AnimateDialogHeader(props: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" {...props} />;
}
export function AnimateDialogFooter(props: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" {...props} />;
}

/* -------------------------------------------------------------------------- */
/* DropdownMenu                                                               */
/* -------------------------------------------------------------------------- */

export type AnimateDropdownMenuProps = ComponentProps<typeof DropdownMenuPrimitive.Root>;

export function AnimateDropdownMenu(props: AnimateDropdownMenuProps) {
  const [isOpen, setIsOpen] = useOpenState(props);
  return (
    <DropdownProvider value={{ isOpen }}>
      <DropdownMenuPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </DropdownProvider>
  );
}

export const AnimateDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const AnimateDropdownMenuGroup = DropdownMenuPrimitive.Group;
export const AnimateDropdownMenuLabel = DropdownMenuPrimitive.Label;
export const AnimateDropdownMenuSeparator = DropdownMenuPrimitive.Separator;
export const AnimateDropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const AnimateDropdownMenuCheckboxItem = DropdownMenuPrimitive.CheckboxItem;
export const AnimateDropdownMenuRadioItem = DropdownMenuPrimitive.RadioItem;
export const AnimateDropdownMenuItemIndicator = DropdownMenuPrimitive.ItemIndicator;
export type AnimateDropdownMenuSubProps = ComponentProps<typeof DropdownMenuPrimitive.Sub>;

export function AnimateDropdownMenuSub(props: AnimateDropdownMenuSubProps) {
  const [isOpen, setIsOpen] = useOpenState(props);
  return (
    <DropdownSubProvider value={{ isOpen }}>
      <DropdownMenuPrimitive.Sub {...props} onOpenChange={setIsOpen} />
    </DropdownSubProvider>
  );
}

export const AnimateDropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;

export function AnimateDropdownMenuSubContent({
  sideOffset = 2,
  alignOffset,
  onEscapeKeyDown,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  transition = { duration: 0.2, ease: 'easeOut' as const },
  ...props
}: HTMLMotionProps<'div'> & {
  sideOffset?: ComponentProps<typeof DropdownMenuPrimitive.SubContent>['sideOffset'];
  alignOffset?: ComponentProps<typeof DropdownMenuPrimitive.SubContent>['alignOffset'];
  onEscapeKeyDown?: ComponentProps<typeof DropdownMenuPrimitive.SubContent>['onEscapeKeyDown'];
  onPointerDownOutside?: ComponentProps<typeof DropdownMenuPrimitive.SubContent>['onPointerDownOutside'];
  onFocusOutside?: ComponentProps<typeof DropdownMenuPrimitive.SubContent>['onFocusOutside'];
  onInteractOutside?: ComponentProps<typeof DropdownMenuPrimitive.SubContent>['onInteractOutside'];
  transition?: HTMLMotionProps<'div'>['transition'];
}) {
  const { isOpen } = useDropdownSub();
  return (
    <AnimatePresence>
      {isOpen ? (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.SubContent
            asChild
            forceMount
            sideOffset={sideOffset}
            alignOffset={alignOffset}
            onEscapeKeyDown={onEscapeKeyDown}
            onPointerDownOutside={onPointerDownOutside}
            onFocusOutside={onFocusOutside}
            onInteractOutside={onInteractOutside}
          >
            <motion.div
              data-slot="dropdown-menu-sub-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={transition}
              {...props}
            />
          </DropdownMenuPrimitive.SubContent>
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AnimateDropdownMenuPortal({ children, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  const { isOpen } = useDropdown();
  return (
    <AnimatePresence>
      {isOpen ? (
        <DropdownMenuPrimitive.Portal forceMount {...props}>
          {children}
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AnimateDropdownMenuContent({
  loop,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  side,
  sideOffset,
  align,
  alignOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  transition = { duration: 0.2, ease: 'easeOut' as const },
  ...props
}: HTMLMotionProps<'div'> & {
  loop?: ComponentProps<typeof DropdownMenuPrimitive.Content>['loop'];
  onCloseAutoFocus?: ComponentProps<typeof DropdownMenuPrimitive.Content>['onCloseAutoFocus'];
  onEscapeKeyDown?: ComponentProps<typeof DropdownMenuPrimitive.Content>['onEscapeKeyDown'];
  onPointerDownOutside?: ComponentProps<typeof DropdownMenuPrimitive.Content>['onPointerDownOutside'];
  onFocusOutside?: ComponentProps<typeof DropdownMenuPrimitive.Content>['onFocusOutside'];
  onInteractOutside?: ComponentProps<typeof DropdownMenuPrimitive.Content>['onInteractOutside'];
  side?: ComponentProps<typeof DropdownMenuPrimitive.Content>['side'];
  sideOffset?: ComponentProps<typeof DropdownMenuPrimitive.Content>['sideOffset'];
  align?: ComponentProps<typeof DropdownMenuPrimitive.Content>['align'];
  alignOffset?: ComponentProps<typeof DropdownMenuPrimitive.Content>['alignOffset'];
  avoidCollisions?: ComponentProps<typeof DropdownMenuPrimitive.Content>['avoidCollisions'];
  collisionBoundary?: ComponentProps<typeof DropdownMenuPrimitive.Content>['collisionBoundary'];
  collisionPadding?: ComponentProps<typeof DropdownMenuPrimitive.Content>['collisionPadding'];
  arrowPadding?: ComponentProps<typeof DropdownMenuPrimitive.Content>['arrowPadding'];
  sticky?: ComponentProps<typeof DropdownMenuPrimitive.Content>['sticky'];
  hideWhenDetached?: ComponentProps<typeof DropdownMenuPrimitive.Content>['hideWhenDetached'];
  transition?: HTMLMotionProps<'div'>['transition'];
}) {
  return (
    <DropdownMenuPrimitive.Content
      asChild
      forceMount
      loop={loop}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onFocusOutside={onFocusOutside}
      onInteractOutside={onInteractOutside}
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      avoidCollisions={avoidCollisions}
      collisionBoundary={collisionBoundary}
      collisionPadding={collisionPadding}
      arrowPadding={arrowPadding}
      sticky={sticky}
      hideWhenDetached={hideWhenDetached}
    >
      <motion.div
        data-slot="dropdown-menu-content"
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={transition}
        {...props}
      />
    </DropdownMenuPrimitive.Content>
  );
}

export const AnimateDropdownMenuItem = DropdownMenuPrimitive.Item;

/* -------------------------------------------------------------------------- */
/* Popover                                                                    */
/* -------------------------------------------------------------------------- */

export type AnimatePopoverProps = ComponentProps<typeof PopoverPrimitive.Root>;

export function AnimatePopover(props: AnimatePopoverProps) {
  const [isOpen, setIsOpen] = useOpenState(props);
  return (
    <PopoverProvider value={{ isOpen }}>
      <PopoverPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </PopoverProvider>
  );
}

export const AnimatePopoverTrigger = PopoverPrimitive.Trigger;
export const AnimatePopoverAnchor = PopoverPrimitive.Anchor;
export const AnimatePopoverClose = PopoverPrimitive.Close;

export function AnimatePopoverPortal({ children, ...props }: ComponentProps<typeof PopoverPrimitive.Portal>) {
  const { isOpen } = usePopover();
  return (
    <AnimatePresence>
      {isOpen ? (
        <PopoverPrimitive.Portal forceMount {...props}>
          {children}
        </PopoverPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AnimatePopoverContent({
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  align,
  alignOffset,
  side,
  sideOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  transition = rinSpring,
  ...props
}: HTMLMotionProps<'div'> & {
  onOpenAutoFocus?: ComponentProps<typeof PopoverPrimitive.Content>['onOpenAutoFocus'];
  onCloseAutoFocus?: ComponentProps<typeof PopoverPrimitive.Content>['onCloseAutoFocus'];
  onEscapeKeyDown?: ComponentProps<typeof PopoverPrimitive.Content>['onEscapeKeyDown'];
  onPointerDownOutside?: ComponentProps<typeof PopoverPrimitive.Content>['onPointerDownOutside'];
  onFocusOutside?: ComponentProps<typeof PopoverPrimitive.Content>['onFocusOutside'];
  onInteractOutside?: ComponentProps<typeof PopoverPrimitive.Content>['onInteractOutside'];
  align?: ComponentProps<typeof PopoverPrimitive.Content>['align'];
  alignOffset?: ComponentProps<typeof PopoverPrimitive.Content>['alignOffset'];
  side?: ComponentProps<typeof PopoverPrimitive.Content>['side'];
  sideOffset?: ComponentProps<typeof PopoverPrimitive.Content>['sideOffset'];
  avoidCollisions?: ComponentProps<typeof PopoverPrimitive.Content>['avoidCollisions'];
  collisionBoundary?: ComponentProps<typeof PopoverPrimitive.Content>['collisionBoundary'];
  collisionPadding?: ComponentProps<typeof PopoverPrimitive.Content>['collisionPadding'];
  arrowPadding?: ComponentProps<typeof PopoverPrimitive.Content>['arrowPadding'];
  sticky?: ComponentProps<typeof PopoverPrimitive.Content>['sticky'];
  hideWhenDetached?: ComponentProps<typeof PopoverPrimitive.Content>['hideWhenDetached'];
  transition?: HTMLMotionProps<'div'>['transition'];
}) {
  return (
    <PopoverPrimitive.Content
      asChild
      forceMount
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      avoidCollisions={avoidCollisions}
      collisionBoundary={collisionBoundary}
      collisionPadding={collisionPadding}
      arrowPadding={arrowPadding}
      sticky={sticky}
      hideWhenDetached={hideWhenDetached}
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
      onFocusOutside={onFocusOutside}
    >
      <motion.div
        data-slot="popover-content"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={transition}
        {...props}
      />
    </PopoverPrimitive.Content>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

export type AnimateTooltipProps = ComponentProps<typeof TooltipPrimitive.Root> & {
  followCursor?: boolean | 'x' | 'y';
  followCursorSpring?: SpringOptions;
};

export function AnimateTooltip({ followCursor = false, followCursorSpring = { stiffness: 200, damping: 17 }, ...props }: AnimateTooltipProps) {
  const [isOpen, setIsOpen] = useOpenState(props);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  return (
    <TooltipProvider value={{ isOpen, x, y, followCursor, spring: followCursorSpring }}>
      <TooltipPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </TooltipProvider>
  );
}

export function AnimateTooltipProvider(props: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider {...props} />;
}

export function AnimateTooltipTrigger({ onMouseMove, ...props }: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const { x, y, followCursor } = useTooltip();
  const handleMouseMove = (event: MouseEvent<HTMLButtonElement>) => {
    onMouseMove?.(event);
    const target = event.currentTarget.getBoundingClientRect();
    if (followCursor === 'x' || followCursor === true) {
      x.set((event.clientX - target.left - target.width / 2) / 2);
    }
    if (followCursor === 'y' || followCursor === true) {
      y.set((event.clientY - target.top - target.height / 2) / 2);
    }
  };
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" onMouseMove={handleMouseMove} {...props} />;
}

export function AnimateTooltipPortal({ children, ...props }: ComponentProps<typeof TooltipPrimitive.Portal>) {
  const { isOpen } = useTooltip();
  return (
    <AnimatePresence>
      {isOpen ? (
        <TooltipPrimitive.Portal forceMount {...props}>
          {children}
        </TooltipPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AnimateTooltipContent({
  onEscapeKeyDown,
  onPointerDownOutside,
  side,
  sideOffset,
  align,
  alignOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  transition = rinSpring,
  ...props
}: HTMLMotionProps<'div'> & {
  onEscapeKeyDown?: ComponentProps<typeof TooltipPrimitive.Content>['onEscapeKeyDown'];
  onPointerDownOutside?: ComponentProps<typeof TooltipPrimitive.Content>['onPointerDownOutside'];
  side?: ComponentProps<typeof TooltipPrimitive.Content>['side'];
  sideOffset?: ComponentProps<typeof TooltipPrimitive.Content>['sideOffset'];
  align?: ComponentProps<typeof TooltipPrimitive.Content>['align'];
  alignOffset?: ComponentProps<typeof TooltipPrimitive.Content>['alignOffset'];
  avoidCollisions?: ComponentProps<typeof TooltipPrimitive.Content>['avoidCollisions'];
  collisionBoundary?: ComponentProps<typeof TooltipPrimitive.Content>['collisionBoundary'];
  collisionPadding?: ComponentProps<typeof TooltipPrimitive.Content>['collisionPadding'];
  arrowPadding?: ComponentProps<typeof TooltipPrimitive.Content>['arrowPadding'];
  sticky?: ComponentProps<typeof TooltipPrimitive.Content>['sticky'];
  hideWhenDetached?: ComponentProps<typeof TooltipPrimitive.Content>['hideWhenDetached'];
  transition?: HTMLMotionProps<'div'>['transition'];
}) {
  const { x, y, followCursor, spring } = useTooltip();
  const translateX = useSpring(x, spring);
  const translateY = useSpring(y, spring);
  return (
    <TooltipPrimitive.Content
      asChild
      forceMount
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      avoidCollisions={avoidCollisions}
      collisionBoundary={collisionBoundary}
      collisionPadding={collisionPadding}
      arrowPadding={arrowPadding}
      sticky={sticky}
      hideWhenDetached={hideWhenDetached}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
    >
      <motion.div
        data-slot="tooltip-content"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={transition}
        style={{
          x: followCursor === 'x' || followCursor === true ? translateX : undefined,
          y: followCursor === 'y' || followCursor === true ? translateY : undefined,
        }}
        {...props}
      />
    </TooltipPrimitive.Content>
  );
}

export const AnimateTooltipArrow = TooltipPrimitive.Arrow;

/* -------------------------------------------------------------------------- */
/* Sheet (based on Dialog)                                                    */
/* -------------------------------------------------------------------------- */

export type AnimateSheetSide = 'top' | 'bottom' | 'left' | 'right';
export type AnimateSheetProps = ComponentProps<typeof DialogPrimitive.Root>;

export function AnimateSheet(props: AnimateSheetProps) {
  const [isOpen, setIsOpen] = useOpenState(props);
  return (
    <SheetProvider value={{ isOpen }}>
      <DialogPrimitive.Root {...props} onOpenChange={setIsOpen} />
    </SheetProvider>
  );
}

export const AnimateSheetTrigger = DialogPrimitive.Trigger;
export const AnimateSheetClose = DialogPrimitive.Close;

export function AnimateSheetPortal({ children, ...props }: ComponentProps<typeof DialogPrimitive.Portal>) {
  const { isOpen } = useSheet();
  return (
    <AnimatePresence>
      {isOpen ? (
        <DialogPrimitive.Portal forceMount {...props}>
          {children}
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AnimateSheetOverlay(props: HTMLMotionProps<'div'>) {
  return (
    <DialogPrimitive.Overlay asChild forceMount>
      <motion.div
        data-slot="sheet-overlay"
        initial={{ opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, filter: 'blur(4px)' }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

export function AnimateSheetContent({
  side = 'right',
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  onFocusOutside,
  transition = { type: 'spring', stiffness: 150, damping: 22 },
  ...props
}: HTMLMotionProps<'div'> & {
  side?: AnimateSheetSide;
  onOpenAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>['onOpenAutoFocus'];
  onCloseAutoFocus?: ComponentProps<typeof DialogPrimitive.Content>['onCloseAutoFocus'];
  onEscapeKeyDown?: ComponentProps<typeof DialogPrimitive.Content>['onEscapeKeyDown'];
  onPointerDownOutside?: ComponentProps<typeof DialogPrimitive.Content>['onPointerDownOutside'];
  onInteractOutside?: ComponentProps<typeof DialogPrimitive.Content>['onInteractOutside'];
  onFocusOutside?: ComponentProps<typeof DialogPrimitive.Content>['onFocusOutside'];
  transition?: HTMLMotionProps<'div'>['transition'];
}) {
  const offscreen: Record<AnimateSheetSide, Record<string, string | number>> = {
    right: { x: '100%', opacity: 0 },
    left: { x: '-100%', opacity: 0 },
    top: { y: '-100%', opacity: 0 },
    bottom: { y: '100%', opacity: 0 },
  };
  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
      onFocusOutside={onFocusOutside}
    >
      <motion.div
        data-slot="sheet-content"
        data-side={side}
        initial={offscreen[side]}
        animate={{ x: 0, y: 0, opacity: 1 }}
        exit={offscreen[side]}
        transition={transition}
        {...props}
      />
    </DialogPrimitive.Content>
  );
}

export const AnimateSheetTitle = DialogPrimitive.Title;
export const AnimateSheetDescription = DialogPrimitive.Description;
