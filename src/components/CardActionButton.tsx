import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { AnimateButton, Tooltip } from '@/components/ui';

const actionGlyphs = {
  star: '\uf588',
  'star-fill': '\uf586',
  heart: '\uf417',
  'heart-fill': '\uf415',
  bookmark: '\uf1a2',
  'bookmark-check': '\uf196',
  'chat-dots': '\uf24a',
  share: '\uf52e',
  image: '\uf42a',
} as const;

export type CardActionIconName = keyof typeof actionGlyphs;

export function CardActionIcon({
  name,
  size = '0.9rem',
}: {
  name: CardActionIconName;
  size?: string;
}) {
  return (
    <motion.span
      aria-hidden="true"
      className="rin-icon-motion"
      whileHover={name.startsWith('star') || name.startsWith('heart') ? { scale: 1.12 } : { y: -1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
    >
      <span
        aria-hidden="true"
        className={`rin-community-action-icon rin-community-action-icon--${name}`}
        style={{
          fontFamily: '"Rin Community Actions"',
          fontSize: size,
          lineHeight: 1,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {actionGlyphs[name]}
      </span>
    </motion.span>
  );
}

export function CardActionButton({
  icon,
  label,
  value,
  active = false,
  toggle = false,
  tone = 'default',
  disabled = false,
  onClick,
  buttonRef,
  iconSize,
}: {
  icon: CardActionIconName;
  label: string;
  value: ReactNode;
  active?: boolean;
  toggle?: boolean;
  tone?: 'default' | 'like' | 'rating';
  disabled?: boolean;
  onClick: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  iconSize?: string;
}) {
  const accessibleLabel = `${label}，${typeof value === 'string' || typeof value === 'number' ? value : ''}`;
  const button = (
    <AnimateButton
      unstyled
      ref={buttonRef}
      type="button"
      className={`home-card-action${active ? ' active' : ''}`}
      data-tone={tone}
      aria-label={accessibleLabel}
      aria-pressed={toggle ? active : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <CardActionIcon name={icon} size={iconSize} />
      <span className="home-card-action-value">{value}</span>
    </AnimateButton>
  );
  return <Tooltip content={label}>{button}</Tooltip>;
}

export default CardActionButton;
