import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UserPresenceAvatar } from './user-presence-avatar';

describe('UserPresenceAvatar', () => {
  const users = [
    {
      id: 'alice',
      name: 'Alice',
      imageUrl: 'https://example.com/alice.png',
      profilePath: '/@alice',
    },
    {
      id: 'bob',
      name: '小波',
      profilePath: '/@bob',
    },
  ];

  it('renders linked avatars and a fallback initial', () => {
    const { container } = render(
      <MemoryRouter>
        <MotionConfig reducedMotion="always">
          <UserPresenceAvatar label="赞助人" users={users} />
        </MotionConfig>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('赞助人')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alice' }).getAttribute('href')).toBe('/@alice');
    expect(screen.getByRole('link', { name: '小波' }).getAttribute('href')).toBe('/@bob');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/alice.png');
    expect(screen.getByText('小')).toBeTruthy();
  });

  it('shows the nickname in the Animate UI tooltip', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MotionConfig reducedMotion="always">
          <UserPresenceAvatar label="赞助人" users={users.slice(0, 1)} />
        </MotionConfig>
      </MemoryRouter>,
    );

    await user.hover(screen.getByRole('link', { name: 'Alice' }));
    expect((await screen.findByRole('tooltip')).textContent).toContain('Alice');
  });
});
