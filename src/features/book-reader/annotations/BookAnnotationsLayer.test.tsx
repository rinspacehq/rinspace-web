import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const annotationMocks = vi.hoisted(() => ({
  loadPage: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  loadOne: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./service", async () => {
  const actual = await vi.importActual<typeof import("./service")>("./service");
  return {
    ...actual,
    loadBookAnnotationPage: annotationMocks.loadPage,
    createBookAnnotation: annotationMocks.create,
    deleteBookAnnotation: annotationMocks.remove,
    loadBookAnnotation: annotationMocks.loadOne,
    updateBookAnnotation: annotationMocks.update,
  };
});

vi.mock("@/services/domains/discussion", () => ({
  createComment: vi.fn(),
  loadComments: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/components/CodeMirrorEditor", () => ({
  default: ({
    value,
    ariaLabel,
    onChange,
  }: {
    value: string;
    ariaLabel: string;
    onChange(value: string): void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import BookAnnotationsLayer from "./BookAnnotationsLayer";

const blockID = "rb_0123456789abcdef0123456789abcdef";
const commit = "a".repeat(40);

function Fixture({
  withSummary = false,
  hasSession = true,
  preferCenteredDialog = false,
}: {
  withSummary?: boolean;
  hasSession?: boolean;
  preferCenteredDialog?: boolean;
}) {
  const articleRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={articleRef}>
        <p data-rin-block-id={blockID} data-rin-block-kind="paragraph">
          稳定段落
        </p>
        <p
          data-rin-block-id={`rb_${"1".repeat(32)}`}
          data-rin-block-kind="paragraph"
        >
          <a href="/kept">链接优先</a>
          <span className="MathJax">公式优先</span>
        </p>
      </div>
      <BookAnnotationsLayer
        bookRef="book"
        pageId="page"
        publicationCommit={commit}
        capabilities={{
          annotationsRead: true,
          annotationsWrite: true,
          annotationsWriteAvailable: true,
          erratumSync: true,
          erratumSyncAvailable: true,
        }}
        articleRef={articleRef}
        hasSession={hasSession}
        preferCenteredDialog={preferCenteredDialog}
      />
      {withSummary ? <span data-testid="summary-fixture" /> : null}
    </div>
  );
}

describe("book reader semantic block actions", () => {
  beforeAll(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1600,
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class {
        observe() {}
        disconnect() {}
      },
    });
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { escape: (value: string) => value },
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    annotationMocks.loadPage.mockReset().mockResolvedValue({
      anchorVersion: "rin-document-bundle/v2",
      publicationCommit: commit,
      public: [],
      mine: [],
    });
    annotationMocks.create.mockReset().mockResolvedValue({});
    annotationMocks.remove.mockReset().mockResolvedValue(undefined);
    annotationMocks.loadOne.mockReset().mockRejectedValue(new Error("none"));
    annotationMocks.update.mockReset().mockResolvedValue({});
    window.history.replaceState({}, "", "/books/book/read#page");
  });

  it("uses one Cross and the four content actions for a paragraph", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    fireEvent.pointerOver(screen.getByText("稳定段落"), {
      pointerType: "mouse",
    });
    const trigger = await screen.findByRole("button", {
      name: "打开第 1 段操作",
    });
    expect(
      screen.getAllByRole("button", { name: /打开第 .* 段操作/ }),
    ).toHaveLength(1);
    await user.click(trigger);
    for (const label of ["笔记", "评论", "问题", "勘误"]) {
      expect(screen.getByRole("menuitem", { name: label })).not.toBeNull();
    }
    expect(screen.queryByRole("menuitem", { name: "高亮" })).toBeNull();
    expect(
      screen.queryByText(/对本段|如何使用|还没有内容|批注回复/),
    ).toBeNull();
  });

  it("opens annotation actions in a centered dialog when the reader has side navigation", async () => {
    const user = userEvent.setup();
    render(<Fixture preferCenteredDialog />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    fireEvent.pointerOver(screen.getByText("稳定段落"), {
      pointerType: "mouse",
    });
    await user.click(
      await screen.findByRole("button", { name: "打开第 1 段操作" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "笔记" }));

    const dialog = await screen.findByRole("dialog", { name: "笔记" });
    expect(dialog.classList.contains("book-annotation-dialog")).toBe(true);
    expect(
      screen.queryByRole("complementary", { name: "正文批注" }),
    ).toBeNull();
  });

  it.each([
    ["笔记", "note", "笔记", "保留这一步", "body"],
    ["评论", "comment", "评论", "这个论证很清楚", "body"],
    ["问题", "question", "问题", "这里是否需要满秩？", "body"],
    ["勘误", "erratum", "建议修正为", "应为 GL(n)", "correctionText"],
  ] as const)(
    "submits %s against the active semantic block",
    async (label, kind, inputLabel, value, valueField) => {
      const user = userEvent.setup();
      render(<Fixture />);
      await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
      fireEvent.pointerOver(screen.getByText("稳定段落"), {
        pointerType: "mouse",
      });
      await user.click(
        await screen.findByRole("button", { name: "打开第 1 段操作" }),
      );
      await user.click(screen.getByRole("menuitem", { name: label }));
      await user.type(
        await screen.findByRole("textbox", { name: inputLabel }),
        value,
      );
      await user.click(screen.getByRole("button", { name: "提交" }));

      await waitFor(() =>
        expect(annotationMocks.create).toHaveBeenCalledWith(
          "book",
          "page",
          expect.objectContaining({
            blockId: blockID,
            publicationCommit: commit,
            kind,
            [valueField]: value,
            selection: null,
          }),
        ),
      );
    },
  );

  it("keeps the paragraph target visible while its Cross is active", async () => {
    render(<Fixture />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    const paragraph = screen.getByText("稳定段落");
    fireEvent.pointerOver(paragraph, { pointerType: "mouse" });

    await screen.findByRole("button", { name: "打开第 1 段操作" });
    expect(paragraph.classList.contains("is-rin-annotation-target")).toBe(true);
  });

  it("keeps a touch target active long enough to tap its Cross", async () => {
    render(<Fixture />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    const paragraph = screen.getByText("稳定段落");
    const touchDown = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(touchDown, "pointerType", { value: "touch" });
    fireEvent(paragraph, touchDown);
    const cross = await screen.findByRole("button", {
      name: "打开第 1 段操作",
    });
    const touchOut = new Event("pointerout", { bubbles: true });
    Object.defineProperties(touchOut, {
      pointerType: { value: "touch" },
      relatedTarget: { value: document.body },
    });
    fireEvent(paragraph, touchOut);

    await new Promise((resolve) => window.setTimeout(resolve, 160));
    expect(cross.isConnected).toBe(true);
  });

  it("lets a guest discover paragraph actions and requests login in place", async () => {
    const user = userEvent.setup();
    const loginRequest = vi.fn();
    window.addEventListener("rinspace:auth-dialog-request", loginRequest);
    render(<Fixture hasSession={false} />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    fireEvent.pointerOver(screen.getByText("稳定段落"), {
      pointerType: "mouse",
    });
    await user.click(
      await screen.findByRole("button", { name: "打开第 1 段操作" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "笔记" }));

    expect(loginRequest).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("笔记")).toBeNull();
    window.removeEventListener("rinspace:auth-dialog-request", loginRequest);
  });

  it("preserves link and MathJax context menus", async () => {
    render(<Fixture />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    const linkEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByRole("link", { name: "链接优先" }).dispatchEvent(linkEvent);
    expect(linkEvent.defaultPrevented).toBe(false);
    const mathEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    screen.getByText("公式优先").dispatchEvent(mathEvent);
    expect(mathEvent.defaultPrevented).toBe(false);
  });

  it("does not render an empty right rail", async () => {
    render(<Fixture />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());
    expect(
      screen.queryByRole("complementary", { name: "正文批注" }),
    ).toBeNull();
  });

  it("does not restore legacy private highlights in the reading surface", async () => {
    annotationMocks.loadPage.mockResolvedValueOnce({
      anchorVersion: "rin-document-bundle/v2",
      publicationCommit: commit,
      public: [],
      mine: [
        {
          blockId: blockID,
          items: [
            {
              id: "8",
              blockId: blockID,
              kind: "highlight",
              body: "",
              status: "active",
              anchorState: "resolved",
              voteCount: 0,
              replyCount: 0,
              author: "我",
              own: true,
              createdAt: "2026-08-25T10:00:00Z",
              updatedAt: "2026-08-25T10:00:00Z",
            },
          ],
        },
      ],
    });
    render(<Fixture />);
    await waitFor(() => expect(annotationMocks.loadPage).toHaveBeenCalled());

    expect(screen.getByText("稳定段落").classList).not.toContain(
      "is-rin-private-highlight",
    );
    expect(
      screen.queryByRole("complementary", { name: "正文批注" }),
    ).toBeNull();
  });

  it("aligns a real question summary to its source block", async () => {
    annotationMocks.loadPage.mockResolvedValueOnce({
      anchorVersion: "rin-document-bundle/v2",
      publicationCommit: commit,
      public: [
        {
          blockId: blockID,
          items: [
            {
              id: "9",
              blockId: blockID,
              kind: "question",
              body: "条件是否充分？",
              status: "open",
              anchorState: "resolved",
              voteCount: 0,
              replyCount: 2,
              author: "林",
              own: false,
              createdAt: "2026-08-25T10:00:00Z",
              updatedAt: "2026-08-25T10:00:00Z",
            },
          ],
        },
      ],
      mine: [],
    });
    render(<Fixture withSummary />);
    expect(
      await screen.findByRole("complementary", { name: "正文批注" }),
    ).not.toBeNull();
    expect(screen.getByText("问题 · 开放")).not.toBeNull();
    expect(screen.getByText("条件是否充分？")).not.toBeNull();
    await userEvent.setup().click(screen.getByText("条件是否充分？"));
    expect(screen.getByText("林")).not.toBeNull();
  });
});
