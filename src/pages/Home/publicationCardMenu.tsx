import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Icon, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui';
import './publicationCardMenu.css';

const primaryLink = '[data-publication-card-link]';

export function usePublicationCardMenu(enabled: boolean, label: string) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [menu, setMenu] = useState<{ path: string; x: number; y: number }>();
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) setMenu(undefined);
  }, [enabled]);

  function cardEvents(path: string | undefined): HTMLAttributes<HTMLElement> | undefined {
    if (!enabled || !path) return;
    return {
      onContextMenu(event) {
        if (event.defaultPrevented || window.getSelection()?.toString().trim()) return;
        const target = event.target instanceof Element ? event.target : event.currentTarget;
        const control = target.closest('a, button, input, select, textarea, [contenteditable], [role=button]');
        if (control && !control.matches(primaryLink)) return;
        const link = event.currentTarget.querySelector<HTMLElement>(primaryLink);
        returnFocus.current = target.closest<HTMLElement>(primaryLink) ?? link;
        event.preventDefault();
        setMenu({ path, x: event.clientX, y: event.clientY });
      },
      onKeyDown(event) {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.matches(primaryLink)) return;
        const bounds = target.getBoundingClientRect();
        returnFocus.current = target;
        event.preventDefault();
        setMenu({ path, x: bounds.left, y: bounds.bottom });
      },
    };
  }

  const element = (
    <Menu open={enabled && Boolean(menu)} onOpenChange={open => { if (!open) setMenu(undefined); }} modal={false}>
      {menu ? (
        <MenuTrigger asChild key={`${menu.x}:${menu.y}`}>
          <span
            className="publication-card-menu-anchor"
            aria-hidden="true"
            tabIndex={-1}
            style={{ top: menu.y, left: menu.x }}
          />
        </MenuTrigger>
      ) : null}
      <MenuContent
        className="publication-card-menu"
        aria-label={label}
        sideOffset={2}
        align="start"
        collisionPadding={8}
        transition={reducedMotion ? { duration: 0 } : undefined}
        onInteractOutside={() => { returnFocus.current = null; }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          returnFocus.current?.focus({ preventScroll: true });
          returnFocus.current = null;
        }}
      >
        <MenuItem onSelect={() => {
          returnFocus.current = null;
          if (menu) navigate(menu.path);
        }}>
          <Icon name="filetype-pdf" size={17} />
          {label}
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  return { cardEvents, element };
}
