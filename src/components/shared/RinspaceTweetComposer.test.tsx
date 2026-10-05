import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  RinspaceTweetComposer,
  resolveTweetComposerMessages,
  type TweetComposerAdapter,
  useTweetComposerController,
} from "./RinspaceTweetComposer";

function adapterFixture() {
  const publish = vi.fn<TweetComposerAdapter["publish"]>().mockResolvedValue({
    id: "7001",
    url: "/p/7001",
    createdAt: "2026-09-07T10:00:00Z",
  });
  const adapter: TweetComposerAdapter = {
    countCharacters: (value) => Array.from(value).length,
    loadConfig: vi.fn().mockResolvedValue({
      maxCharacters: 500,
      maxMediaAttachments: 4,
      maxMediaBytes: 10_000_000,
      acceptedMediaTypes: ["image/*", "video/*"],
      pollMinOptions: 2,
      pollMaxOptions: 4,
      pollMaxOptionCharacters: 50,
      pollDurations: [300, 3600, 86_400],
      languages: [{ code: "zh-CN", label: "简体中文" }, { code: "en", label: "English" }],
      defaultLanguage: "zh-CN",
      defaultVisibility: "public",
    }),
    loadEmojis: vi.fn().mockResolvedValue([]),
    searchSuggestions: vi.fn().mockResolvedValue([]),
    uploadMedia: vi.fn(),
    updateMediaDescription: vi.fn().mockResolvedValue(undefined),
    publish,
  };
  return { adapter, publish };
}

function Fixture({ adapter }: { adapter: TweetComposerAdapter }) {
  const messages = resolveTweetComposerMessages("zh-CN");
  const controller = useTweetComposerController({ adapter, messages });
  return (
    <RinspaceTweetComposer
      {...controller.composerProps}
      account={{ displayName: "测试用户" }}
      messages={messages}
      onRequestClose={() => undefined}
    />
  );
}

function ControllerFixture({
  adapter,
  enabled,
}: {
  adapter: TweetComposerAdapter;
  enabled: boolean;
}) {
  const messages = resolveTweetComposerMessages("zh-CN");
  useTweetComposerController({ adapter, enabled, messages });
  return null;
}

describe("RinspaceTweetComposer", () => {
  it("does not load runtime configuration until its dialog is enabled", async () => {
    const { adapter } = adapterFixture();
    const { rerender } = render(
      <ControllerFixture adapter={adapter} enabled={false} />,
    );

    expect(adapter.loadConfig).not.toHaveBeenCalled();
    rerender(<ControllerFixture adapter={adapter} enabled />);
    await waitFor(() => expect(adapter.loadConfig).toHaveBeenCalledOnce());
  });

  it("provides the complete shared controls and publishes through its adapter", async () => {
    const user = userEvent.setup();
    const { adapter, publish } = adapterFixture();
    render(<Fixture adapter={adapter} />);

    const editor = await screen.findByPlaceholderText("有什么新鲜事？");
    expect(screen.getByLabelText("可见范围")).toBeTruthy();
    expect(screen.getByLabelText("语言")).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加媒体" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加投票" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加表情" })).toBeTruthy();

    await user.type(editor, "完整发布测试");
    await user.click(screen.getByText("内容警告"));
    await user.type(screen.getByPlaceholderText("简要说明需要预警的内容"), "测试预警");
    await user.click(screen.getByRole("button", { name: "添加投票" }));
    await user.type(screen.getByPlaceholderText("选项 1"), "甲");
    await user.type(screen.getByPlaceholderText("选项 2"), "乙");
    await user.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(publish.mock.calls[0]?.[0]).toMatchObject({
      text: "完整发布测试",
      sensitive: true,
      spoilerText: "测试预警",
      visibility: "public",
      poll: { options: ["甲", "乙"], multiple: false },
    });
    expect(publish.mock.calls[0]?.[0].idempotencyKey).toMatch(/^tweet-/);
  });
});
