import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Bell, BellRing, Filter, GitCommit, History, Kanban, More, Paintbrush, Plus, Refresh, Search, ShieldCheck, Star, ThumbsDown, ThumbsUp, Wallet } from './icons';

describe('animated icons', () => {
  it('renders animated nav icons with hover triggers', () => {
    render(
      <>
        <Plus data-testid="plus" animateOnHover size={16} />
        <Bell data-testid="bell" animateOnHover size={16} />
        <BellRing data-testid="bell-ring" animateOnHover size={16} />
        <Kanban data-testid="kanban" animateOnHover size={16} />
        <Paintbrush data-testid="paintbrush" animateOnHover size={16} />
        <Search data-testid="search" animateOnHover size={16} />
        <Filter data-testid="filter" animateOnHover size={16} />
        <ShieldCheck data-testid="shield" animateOnHover size={16} />
        <History data-testid="history" animateOnHover size={16} />
        <Wallet data-testid="wallet" animateOnHover size={16} />
        <GitCommit data-testid="git-commit" animateOnHover size={16} />
        <Refresh data-testid="refresh" animateOnHover size={16} />
        <More data-testid="more" animateOnHover size={16} />
        <ThumbsUp data-testid="thumbs-up" animateOnHover size={16} />
        <ThumbsDown data-testid="thumbs-down" animateOnHover size={16} />
        <Star data-testid="star" animateOnHover animateOnTap size={16} />
      </>,
    );
    for (const id of ['plus', 'bell', 'bell-ring', 'kanban', 'paintbrush', 'search', 'filter', 'shield', 'history', 'wallet', 'git-commit', 'refresh', 'more', 'thumbs-up', 'thumbs-down', 'star']) {
      const el = screen.getByTestId(id);
      expect(el).toBeTruthy();
      expect(el.tagName.toLowerCase()).toBe('svg');
    }
  });
});
