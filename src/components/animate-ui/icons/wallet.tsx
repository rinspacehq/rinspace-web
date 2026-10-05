'use client';

import { motion, type Variants } from 'motion/react';

import { getVariants, IconWrapper, type IconProps, useAnimateIconContext } from '../animate-icon';

type WalletProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    body: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 0.97, 1],
        transition: { duration: 0.42, ease: 'easeInOut' },
      },
    },
    pocket: {
      initial: { x: 0, pathLength: 1 },
      animate: {
        x: [0, -0.8, 0],
        pathLength: [0.72, 1],
        transition: { duration: 0.46, ease: 'easeInOut' },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: WalletProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      data-animate-ui-icon="wallet"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path
        d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"
        variants={variants.body}
        initial="initial"
        animate={controls}
        style={{ transformOrigin: '12px 13px' }}
      />
      <motion.path
        d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"
        variants={variants.pocket}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function Wallet(props: WalletProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export { animations, Wallet, Wallet as WalletIcon, type WalletProps };
