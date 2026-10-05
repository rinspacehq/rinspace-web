import axe from 'axe-core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  Button, Command, Dialog, DialogContent, DialogTrigger, Menu, MenuContent, MenuItem, MenuTrigger,
  Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetTrigger, ToastProvider, Tooltip,
  useToast,
} from './primitives';

async function expectAccessible() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([]);
}

describe('overlay primitive accessibility', () => {
  it('covers dialog and sheet states', async () => {
    const user = userEvent.setup();
    render(<><Dialog><DialogTrigger asChild><Button>打开对话框</Button></DialogTrigger><DialogContent title="确认" description="确认当前操作"><Button>继续</Button></DialogContent></Dialog><Sheet><SheetTrigger asChild><Button>打开侧栏</Button></SheetTrigger><SheetContent title="侧栏">内容</SheetContent></Sheet></>);
    await user.click(screen.getByRole('button', { name: '打开对话框' }));
    await expectAccessible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.getAttribute('data-scroll-locked')).toBeNull());
    await user.click(screen.getByRole('button', { name: '打开侧栏' }));
    await expectAccessible();
  });

  it('covers menu, popover and tooltip states', async () => {
    const user = userEvent.setup();
    render(<><Menu><MenuTrigger asChild><Button>菜单</Button></MenuTrigger><MenuContent><MenuItem>项目</MenuItem></MenuContent></Menu><Popover><PopoverTrigger asChild><Button>弹出内容</Button></PopoverTrigger><PopoverContent>说明</PopoverContent></Popover><Tooltip content="提示文字"><Button>提示</Button></Tooltip></>);
    await user.click(screen.getByRole('button', { name: '菜单' }));
    await expectAccessible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.getAttribute('data-scroll-locked')).toBeNull());
    await user.click(screen.getByRole('button', { name: '弹出内容' }));
    await expectAccessible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.getAttribute('data-scroll-locked')).toBeNull());
    await user.hover(screen.getByRole('button', { name: '提示' }));
    await expectAccessible();
  });

  it('covers command and toast states', async () => {
    const onToastAction = vi.fn();
    function ToastFixture() {
      const toast = useToast();
      return (
        <Button
          onClick={() => toast.notify({
            title: '保存成功',
            actionLabel: '查看文章',
            onAction: onToastAction,
          })}
        >
          通知
        </Button>
      );
    }
    function CommandFixture() { const [open, setOpen] = useState(true); return <Command open={open} onOpenChange={setOpen} label="快速命令"><div role="option">搜索结果</div></Command>; }
    const user = userEvent.setup();
    render(<ToastProvider><ToastFixture /><CommandFixture /></ToastProvider>);
    await expectAccessible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.body.getAttribute('data-scroll-locked')).toBeNull());
    await user.click(screen.getByRole('button', { name: '通知' }));
    await expectAccessible();
    expect(screen.getByRole('button', { name: '查看文章' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '查看文章' }));
    expect(onToastAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '查看文章' })).toBeNull();
  });
});
