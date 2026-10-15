import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Adapted from Animate UI's community/radial-menu at efeb96ffd7a3b7a4868667e4ac3c346620fb3044.
 * Copyright (c) 2025 Elliot Sutton; community component by arhamkhnz.
 * Rinspace modifications copyright (c) 2026 任务优先（上海）网络科技有限责任公司.
 * Governing terms: licenses/Animate-UI-MIT-Commons-Clause.txt.
 * The upstream annular paths and spring animation use our existing Radix menu
 * layer for a controlled document-level trigger, focus, dismissal and keyboard navigation.
 */

export type RadialMenuPoint = { x: number; y: number };
export type RadialMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  href?: string;
  title?: string;
};

type AnimateRadialMenuProps = {
  point: RadialMenuPoint | null;
  menuItems: readonly RadialMenuItem[];
  label: string;
  hint: string;
  onClose(): void;
  onSelect(item: RadialMenuItem): void;
};

const menuTransition: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 1 };
const size = 264;
const radius = size / 2;
const outerRingInnerRadius = radius - 12;
const wedgeOuterRadius = outerRingInnerRadius - 8;
const wedgeInnerRadius = wedgeOuterRadius - 64;
const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;
const centerRadius = wedgeInnerRadius - 8;

function polarToCartesian(distance: number, angle: number): RadialMenuPoint {
  const radians = angle * Math.PI / 180;
  return { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
}

function slicePath(index: number, total: number, outer: number, inner: number) {
  if (total <= 0) return '';
  if (total === 1) {
    return `M ${outer} 0 A ${outer} ${outer} 0 1 1 ${-outer} 0 A ${outer} ${outer} 0 1 1 ${outer} 0
      M ${inner} 0 A ${inner} ${inner} 0 1 0 ${-inner} 0 A ${inner} ${inner} 0 1 0 ${inner} 0`;
  }
  const angle = 360 / total;
  const middle = -90 + angle * index;
  const start = polarToCartesian(outer, middle - angle / 2);
  const end = polarToCartesian(outer, middle + angle / 2);
  const innerStart = polarToCartesian(inner, middle - angle / 2);
  const innerEnd = polarToCartesian(inner, middle + angle / 2);
  const largeArc = angle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${outer} ${outer} 0 ${largeArc} 1 ${end.x} ${end.y}
    L ${innerEnd.x} ${innerEnd.y} A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

export function AnimateRadialMenu({ point, menuItems, label, hint, onClose, onSelect }: AnimateRadialMenuProps) {
  const open = point !== null;
  const reducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const previousFocus = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const menuSize = Math.max(1, Math.min(size, window.innerWidth - 24, window.innerHeight - 24));
  const menuRadius = menuSize / 2;

  useLayoutEffect(() => {
    if (open) {
      restoreFocus.current = false;
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else {
      setActiveIndex(null);
    }
  }, [open]);

  // Center on the pointer, then keep the entire circle inside the viewport.
  const x = Math.max(menuRadius + 12, Math.min(point?.x ?? 0, window.innerWidth - menuRadius - 12));
  const y = Math.max(menuRadius + 12, Math.min(point?.y ?? 0, window.innerHeight - menuRadius - 12));

  return (
    <DropdownMenu.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} modal={false}>
      <DropdownMenu.Trigger
        className="rin-radial-menu-anchor"
        style={{ left: x, top: y }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <AnimatePresence>
        {open && (
          <DropdownMenu.Portal forceMount>
            <DropdownMenu.Content
              asChild
              forceMount
              align="start"
              side="bottom"
              alignOffset={-menuRadius}
              sideOffset={-menuRadius}
              collisionPadding={12}
              loop
              aria-label={label}
              aria-labelledby={undefined}
              onEscapeKeyDown={() => { restoreFocus.current = true; }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (restoreFocus.current && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
              }}
            >
              <motion.div
                className="rin-radial-menu"
                style={{ width: menuSize, height: menuSize }}
                initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.8 }}
                transition={reducedMotion ? { duration: 0 } : menuTransition}
              >
                <svg className="rin-radial-menu__surface" viewBox={`${-radius} ${-radius} ${size} ${size}`}>
                  {menuItems.map((item, index) => {
                    const { x: iconX, y: iconY } = polarToCartesian(iconRingRadius, -90 + 360 / menuItems.length * index);
                    return (
                      <g
                        key={item.id}
                        className="rin-radial-menu__sector"
                        data-active={activeIndex === index ? '' : undefined}
                        onPointerEnter={() => {
                          setActiveIndex(index);
                          itemRefs.current[index]?.focus({ preventScroll: true });
                        }}
                        onPointerUp={(event) => {
                          if (event.button !== 0 || (event.target instanceof Element && event.target.closest('[role="menuitem"]'))) return;
                          itemRefs.current[index]?.click();
                        }}
                      >
                        <path className="rin-radial-menu__ring" d={slicePath(index, menuItems.length, radius, outerRingInnerRadius)} aria-hidden="true" />
                        <path className="rin-radial-menu__wedge" d={slicePath(index, menuItems.length, wedgeOuterRadius, wedgeInnerRadius)} aria-hidden="true" />
                        <foreignObject x={iconX - 40} y={iconY - 26} width={80} height={52}>
                          <DropdownMenu.Item
                            asChild={Boolean(item.href)}
                            ref={(element) => { itemRefs.current[index] = element; }}
                            className="rin-radial-menu__item"
                            onFocus={() => setActiveIndex(index)}
                            onSelect={() => { onSelect(item); onClose(); }}
                            title={item.title}
                          >
                            {item.href ? (
                              <a href={item.href} target="_blank" rel="noopener noreferrer">
                                {item.icon}<span>{item.label}</span>
                              </a>
                            ) : (
                              <>{item.icon}<span>{item.label}</span></>
                            )}
                          </DropdownMenu.Item>
                        </foreignObject>
                      </g>
                    );
                  })}
                  <circle className="rin-radial-menu__center" r={centerRadius} aria-hidden="true" />
                </svg>
                <div className="rin-radial-menu__caption" aria-hidden="true">
                  <span>{label}</span><small>{hint}</small>
                </div>
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        )}
      </AnimatePresence>
    </DropdownMenu.Root>
  );
}
