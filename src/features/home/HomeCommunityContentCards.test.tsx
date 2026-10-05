import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/CodeMirrorEditor", () => ({
  default: ({
    ariaLabel,
    placeholder,
    value,
    onChange,
  }: {
    ariaLabel: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("@/services/domains/discussion", () => ({
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  loadComments: vi.fn().mockResolvedValue([]),
  postAnswerStyleVote: vi.fn(),
  updateComment: vi.fn(),
}));

vi.mock("@/services/domains/publication", () => ({
  uploadAnswerFile: vi.fn(),
}));

import type { CommentSummary } from "@/services/contracts";
import { ensureLocaleNamespaces, i18n } from "@/i18n";
import { createComment } from "@/services/domains/discussion";
import { uploadAnswerFile } from "@/services/domains/publication";
import {
  CardActionButton,
  ContentCommentDialog,
  contentTimePresentation,
  groupCommentThreads,
} from "./HomeCommunityContentCards";

function comment(
  id: number,
  parentId?: number,
  createdAt = "2026-08-25T13:00:00Z",
): CommentSummary {
  return {
    id,
    targetType: "post",
    targetId: 7,
    parentId,
    author: `用户 ${id}`,
    body: `评论 ${id}`,
    voteCount: 0,
    upVoteCount: 0,
    downVoteCount: 0,
    viewerVoteStatus: "none",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("home community content cards", () => {
  beforeAll(async () => {
    await ensureLocaleNamespaces("zh-CN", ["discovery"]);
  });

  it("keeps the compact card time while exposing publish and update semantics", () => {
    expect(
      contentTimePresentation({
        publishedAt: "2026-08-19T05:30:00Z",
        contentUpdatedAt: "2026-08-23T12:04:00Z",
      }),
    ).toEqual({
      dateTime: "2026-08-23T12:04:00Z",
      label: "2026/08/23 20:04",
      detail: "发布于 2026/08/19 13:30；更新于 2026/08/23 20:04",
    });
  });

  it("uses published time when content has not materially changed", () => {
    const presentation = contentTimePresentation({
      publishedAt: "2026-08-19T05:30:00Z",
      contentUpdatedAt: "2026-08-19T05:30:20Z",
    });
    expect(presentation.label).toBe("2026/08/19 13:30");
    expect(presentation.detail).toBe("发布于 2026/08/19 13:30");
  });

  it("groups replies under roots and sorts replies oldest first", () => {
    const threads = groupCommentThreads([
      comment(1),
      comment(3, 1, "2026-08-25T13:03:00Z"),
      comment(2, 1, "2026-08-25T13:02:00Z"),
      comment(4),
    ]);
    expect(threads.map((thread) => thread.root.id)).toEqual([1, 4]);
    expect(threads[0]?.replies.map((reply) => reply.id)).toEqual([2, 3]);
  });

  it("exposes a liked card action as a pressed semantic toggle", () => {
    render(
      <CardActionButton
        icon="heart-fill"
        label="喜欢"
        value={12}
        active
        toggle
        tone="like"
        onClick={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: "喜欢，12" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("data-tone")).toBe("like");
    expect(button.classList.contains("active")).toBe(true);
    expect(
      button.querySelector(".rin-community-action-icon--heart-fill"),
    ).not.toBeNull();
    expect(button.querySelector(".home-card-action-label")).toBeNull();
    expect(button.querySelector(".home-card-action-value")?.textContent).toBe(
      "12",
    );
  });

  it("exposes a rated card action with a filled semantic state", () => {
    render(
      <CardActionButton
        icon="star-fill"
        label="评分"
        value={29}
        active
        tone="rating"
        onClick={() => undefined}
      />,
    );
    const button = screen.getByRole("button", { name: "评分，29" });
    expect(button.getAttribute("aria-pressed")).toBeNull();
    expect(button.getAttribute("data-tone")).toBe("rating");
    expect(button.classList.contains("active")).toBe(true);
    expect(
      button.querySelector(".rin-community-action-icon--star-fill"),
    ).not.toBeNull();
  });

  it("keeps the signed-in overlay free of prompting copy and accepts images only", async () => {
    vi.mocked(uploadAnswerFile).mockResolvedValue(
      "https://cdn.example.test/comments/proof.png",
    );
    const target = {
      id: "77",
      type: "blog" as const,
      title: "测试文章",
      author: "作者",
      meta: "",
      excerpt: "",
      tags: [],
      interactions: "",
      heat: "",
      commentCount: 0,
    };
    render(
      <MemoryRouter>
        <ContentCommentDialog
          target={target}
          canWrite
          viewer={{ name: "当前用户", username: "viewer" }}
          onOpenChange={() => undefined}
          onChanged={() => undefined}
          onMessage={() => undefined}
        />
      </MemoryRouter>,
    );

    const editor = await screen.findByRole("textbox", { name: "评论内容" });
    expect(editor.getAttribute("placeholder")).toBe("");
    expect(screen.queryByText(/说点什么|友善交流|写下你的/)).toBeNull();
    expect(screen.getByText("图片")).not.toBeNull();
    const imageInput =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(imageInput?.getAttribute("accept")).toBe("image/*");
    expect(imageInput?.multiple).toBe(true);
    fireEvent.change(imageInput as HTMLInputElement, {
      target: {
        files: [new File(["image"], "proof.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect((editor as HTMLTextAreaElement).value).toContain(
        "![proof](https://cdn.example.test/comments/proof.png)",
      ),
    );
    expect(uploadAnswerFile).toHaveBeenCalledWith("post", expect.any(File));
  });

  it("keeps the updated comment count when the list order changes", async () => {
    vi.mocked(createComment).mockResolvedValue(comment(9));
    const target = {
      id: "77",
      type: "blog" as const,
      title: "测试文章",
      author: "作者",
      meta: "",
      excerpt: "",
      tags: [],
      interactions: "",
      heat: "",
      commentCount: 5,
    };
    render(
      <MemoryRouter>
        <ContentCommentDialog
          target={target}
          canWrite
          viewer={{ name: "当前用户", username: "viewer" }}
          onOpenChange={() => undefined}
          onChanged={() => undefined}
          onMessage={() => undefined}
        />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "评论内容" }), {
      target: { value: "一条有效评论" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发布评论" }));
    await waitFor(() =>
      expect(
        document.querySelector(".home-overlay-title small")?.textContent,
      ).toBe("6"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "最新" }));
    await waitFor(() =>
      expect(
        document.querySelector(".home-overlay-title small")?.textContent,
      ).toBe("6"),
    );
  });

  it("renders the comment overlay controls in English", async () => {
    await ensureLocaleNamespaces("en", ["discovery"]);
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    const target = {
      id: "88",
      type: "blog" as const,
      title: "Author title",
      author: "Author",
      meta: "",
      excerpt: "",
      tags: [],
      interactions: "",
      heat: "",
      commentCount: 0,
    };

    render(
      <MemoryRouter>
        <ContentCommentDialog
          target={target}
          canWrite
          viewer={{ name: "Reader" }}
          onOpenChange={() => undefined}
          onChanged={() => undefined}
          onMessage={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Comments")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Comment" })).toBeTruthy();
    expect(screen.getByText("Image")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post comment" })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });
  });
});
