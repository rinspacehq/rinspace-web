import { act, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { forwardRef } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ToastProvider } from "components/ui";
import { ensureLocaleNamespaces, i18n } from "@/i18n";
import { createContent, loadContentDetail, updateContent } from "@/services/domains/article";
import {
  submitMarkdownRenderJob,
  uploadAnswerFile,
} from "@/services/domains/publication";
import { getCurrentUser } from "@/services/profile";
import type { PostDetail } from "@/services/feed";

import BlogMarkdownPage from "./index";

const crepeState = vi.hoisted(() => ({
  constructs: 0,
  creates: 0,
  destroys: 0,
  markdown: "",
  firstHeadingLabel: "",
  placeholderEnabled: true,
  root: null as HTMLElement | null,
  markdownUpdated: (_ctx: unknown, _markdown: string) => {},
}));

vi.mock("@milkdown/crepe", () => {
  class MockCrepe {
    static Feature = {
      CodeMirror: "CodeMirror",
      Latex: "Latex",
      Toolbar: "Toolbar",
      BlockEdit: "BlockEdit",
      TopBar: "TopBar",
      Table: "Table",
      ImageBlock: "ImageBlock",
      LinkTooltip: "LinkTooltip",
      Placeholder: "Placeholder",
    };

    editor = {
      use: vi.fn(),
      action: vi.fn(),
    };

    constructor(options: {
      root?: HTMLElement;
      defaultValue?: string;
      features?: Record<string, boolean>;
      featureConfigs?: Record<
        string,
        {
          headingOptions?: Array<{ label: string }>;
        }
      >;
    }) {
      crepeState.constructs += 1;
      crepeState.root = options.root || null;
      crepeState.markdown = options.defaultValue || "";
      crepeState.firstHeadingLabel =
        options.featureConfigs?.TopBar?.headingOptions?.[0]?.label || "";
      crepeState.placeholderEnabled = options.features?.Placeholder !== false;
    }

    on(
      callback: (listener: {
        markdownUpdated(
          handler: (ctx: unknown, markdown: string) => void,
        ): void;
      }) => void,
    ) {
      callback({
        markdownUpdated: (handler) => {
          crepeState.markdownUpdated = handler;
        },
      });
      return this;
    }

    async create() {
      if (crepeState.root) {
        crepeState.root.innerHTML = '<div class="milkdown"><div class="milkdown-top-bar"><div class="top-bar-inner"></div></div></div>';
      }
      crepeState.creates += 1;
    }

    getMarkdown() {
      return crepeState.markdown;
    }

    destroy() {
      if (crepeState.root) crepeState.root.innerHTML = "";
      crepeState.destroys += 1;
    }
  }

  return { Crepe: MockCrepe };
});

vi.mock("@rinspacehq/markdown-writer/page", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@rinspacehq/markdown-writer/page")>();
  const { Crepe } = await import("@milkdown/crepe");
  const ActualMarkdownWriterPage = actual.MarkdownWriterPage;
  const TestMarkdownWriterPage = forwardRef<
    import("@rinspacehq/markdown-writer/page").MarkdownWriterHandle,
    import("@rinspacehq/markdown-writer/page").MarkdownWriterPageProps
  >((props, ref) => (
    <ActualMarkdownWriterPage
      {...props}
      ref={ref}
      createEditor={(options) => {
        const editor = new Crepe(options);
        crepeState.firstHeadingLabel = options.headingOptions[0]?.label || "";
        crepeState.placeholderEnabled = options.placeholder !== false;
        return editor;
      }}
    />
  ));
  return {
    ...actual,
    MarkdownWriterPage: TestMarkdownWriterPage,
  };
});

vi.mock("@/components/SiteTopbarShell", () => ({ default: () => null }));
vi.mock("@/components/ImageCropDialog", () => ({ default: () => null }));
vi.mock("@/components/MilkdownMarkdownArticle", () => ({
  default: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));
vi.mock("@/components/CodeMirrorEditor", () => ({
  default: ({ ariaLabel, value }: { ariaLabel: string; value: string }) => (
    <textarea aria-label={ariaLabel} value={value} readOnly />
  ),
}));
vi.mock("@/components/TagPicker", () => ({
  default: ({ ariaLabel }: { ariaLabel?: string }) => (
    <input aria-label={ariaLabel} />
  ),
  splitTagValues: (value: string) => value.split(/[,\s]+/).filter(Boolean),
  joinTagValues: (values: string[]) => values.join(", "),
}));

vi.mock("@/services/profile", () => ({
  getCurrentUser: vi.fn(),
  uploadCoverFile: vi.fn(),
}));
vi.mock("@/services/phoneAuth", () => ({
  authHeaders: () => ({}),
  getAuthAccessToken: vi.fn().mockResolvedValue(""),
  getAuthDeviceId: vi.fn(() => "test-device"),
  hasAuthSession: vi.fn(() => true),
}));
vi.mock("@/services/domains/article", () => ({
  createContent: vi.fn(),
  updateContent: vi.fn(),
  loadContentDetail: vi.fn(),
  isContentModerationSubmission: () => false,
}));
vi.mock("@/services/domains/identity", () => ({ moveWorkItem: vi.fn() }));
vi.mock("@/services/domains/publication", () => ({
  cancelMarkdownRenderJob: vi.fn(),
  loadMarkdownRenderJob: vi.fn(),
  submitMarkdownRenderJob: vi.fn(),
  uploadAnswerFile: vi.fn(),
}));

const savedMarkdownPost = {
  id: "article-17",
  slug: "derived-categories",
  type: "blog",
  title: "Derived categories",
  body: "[[RIN_MARKDOWN_SOURCE]]\n# Derived categories\n\nSaved source.\n[[/RIN_MARKDOWN_SOURCE]]",
  excerpt: "An introduction",
  tags: [],
  coverUrl: "",
  editor: "markdown",
  publishStatus: "published",
  repositoryStatus: "published",
  sourceVisibility: "open",
} as unknown as PostDetail;

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderWriter(entry = "/write/markdown") {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <LocationProbe />
                  <BlogMarkdownPage />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  crepeState.constructs = 0;
  crepeState.creates = 0;
  crepeState.destroys = 0;
  crepeState.markdown = "";
  crepeState.firstHeadingLabel = "";
  crepeState.placeholderEnabled = true;
  crepeState.root = null;
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "author-1" });
  vi.mocked(createContent).mockReset();
  vi.mocked(loadContentDetail).mockReset();
  vi.mocked(updateContent).mockReset();
  vi.mocked(submitMarkdownRenderJob).mockReset();
  vi.mocked(uploadAnswerFile).mockReset();
  vi.mocked(submitMarkdownRenderJob).mockResolvedValue({
    enabled: false,
    mode: "disabled",
  });
  vi.mocked(uploadAnswerFile).mockResolvedValue(
    "https://cdn.example/source.md",
  );
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/rin-writer/draft')) {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ draft: body.draft, revision: 1, sourceId: body.sourceId, updatedAt: new Date().toISOString() }), { status: 200 });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }));
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
});

test("waits for creation translations before constructing the Markdown editor", async () => {
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  i18n.removeResourceBundle("en", "creation");

  renderWriter();

  expect(crepeState.creates).toBe(0);
  await waitFor(() => expect(crepeState.creates).toBe(1));
  expect(crepeState.firstHeadingLabel).toBe("Paragraph");
});

test("switches Markdown writer controls without rebuilding the editor or losing the title", async () => {
  await ensureLocaleNamespaces("en", ["creation"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = renderWriter();
  const titleInput = await view.findByLabelText("Article title");
  await waitFor(() => expect(crepeState.creates).toBe(1));
  expect(titleInput.getAttribute("placeholder")).toBeNull();
  expect(crepeState.placeholderEnabled).toBe(false);
  fireEvent.change(titleInput, { target: { value: "未提交的同调代数笔记" } });

  expect(view.getByLabelText("Source visibility")).toBeTruthy();
  expect(view.getByRole("button", { name: "Save draft" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Publish" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Summary" })).toBeTruthy();

  i18n.removeResourceBundle("zh-CN", "creation");
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  expect(
    ((await view.findByLabelText("文章标题")) as HTMLInputElement).value,
  ).toBe("未提交的同调代数笔记");
  expect(view.getByLabelText("源码可见性")).toBeTruthy();
  expect(view.getByRole("button", { name: "保存草稿" })).toBeTruthy();
  expect(view.getByRole("button", { name: "发布" })).toBeTruthy();
  expect(crepeState.constructs).toBe(1);
  expect(crepeState.creates).toBe(1);
  expect(crepeState.destroys).toBe(0);
  expect(document.title).toBe("Markdown 写作 · 芥子环");
});

test("uses the shared writer page to synchronize an edited first line with the title", async () => {
  const view = renderWriter();
  const titleInput = await view.findByLabelText("文章标题");
  await waitFor(() => expect(crepeState.creates).toBe(1));

  fireEvent.change(titleInput, { target: { value: "标题框内容" } });
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  act(() => crepeState.markdownUpdated(undefined, "编辑器首行内容"));

  await waitFor(() => {
    expect((view.getByLabelText("文章标题") as HTMLInputElement).value).toBe(
      "编辑器首行内容",
    );
  });
});

test("toggles the Markdown editor fullscreen mode and exits with Escape", async () => {
  const view = renderWriter();
  const fullscreenButton = await view.findByRole("button", {
    name: "进入全屏编辑",
  });
  const editorFrame = fullscreenButton.closest(".markdown-writer-frame");

  expect(editorFrame?.getAttribute("data-editor-fullscreen")).toBe("false");
  await userEvent.click(fullscreenButton);

  expect(editorFrame?.getAttribute("data-editor-fullscreen")).toBe("true");
  expect(document.body.style.overflow).toBe("hidden");
  expect(view.getByRole("button", { name: "退出全屏编辑" })).toBeTruthy();

  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => {
    expect(editorFrame?.getAttribute("data-editor-fullscreen")).toBe("false");
  });
  expect(document.body.style.overflow).toBe("");
});

test("keeps the Markdown editor open and offers a detail link after saving", async () => {
  await ensureLocaleNamespaces("en", ["creation"]);
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  vi.mocked(createContent).mockResolvedValue(savedMarkdownPost);

  const view = renderWriter();
  const titleInput = await view.findByLabelText("文章标题");
  await waitFor(() => expect(crepeState.creates).toBe(1));
  fireEvent.change(titleInput, { target: { value: "Derived categories" } });
  crepeState.markdown =
    "# Derived categories\n\nKeep this source after first save.";
  act(() => crepeState.markdownUpdated(undefined, crepeState.markdown));
  fireEvent.click(view.getByRole("button", { name: "发布" }));

  await waitFor(() =>
    expect(view.getByTestId("location").textContent).toContain(
      "/write/markdown?edit=derived-categories",
    ),
  );
  const viewArticle = await view.findByRole("button", { name: "查看文章" });
  await waitFor(() =>
    expect(crepeState.markdown).toContain("Keep this source after first save."),
  );
  expect(view.getByTestId("location").textContent).toContain("/write/markdown");
  await userEvent.click(viewArticle);
  await waitFor(() =>
    expect(view.getByTestId("location").textContent).toBe(
      "/a/article-17/derived-categories",
    ),
  );
});

test("saves source to the account before publishing and retains it when publishing fails", async () => {
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  const order: string[] = [];
  const draftFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/api/rin-writer/draft') && init?.method === 'PUT') {
      order.push('draft');
    }
    return draftFetch(input, init);
  }));
  vi.mocked(createContent).mockImplementation(async () => {
    order.push('content');
    throw new Error('Element <mjx-mid> is not in the final schema.');
  });

  const view = renderWriter();
  const titleInput = await view.findByLabelText("文章标题");
  await waitFor(() => expect(crepeState.creates).toBe(1));
  fireEvent.change(titleInput, { target: { value: "未完成的公式文章" } });
  crepeState.markdown = "# 未完成的公式文章\n\n重要原文";
  act(() => crepeState.markdownUpdated(undefined, crepeState.markdown));
  fireEvent.click(view.getByRole("button", { name: "发布" }));

  await waitFor(() => expect(view.getByText(/发布失败，原文已保存到账号草稿/)).toBeTruthy());
  expect(order).toEqual(['draft', 'content']);
  expect(vi.mocked(createContent).mock.calls[0][0].body).toContain('重要原文');
  expect(submitMarkdownRenderJob).not.toHaveBeenCalled();
  expect(view.getByTestId('location').textContent).toBe('/write/markdown');
});

test("saving a draft does not call the renderer", async () => {
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  vi.mocked(createContent).mockResolvedValue({ ...savedMarkdownPost, publishStatus: 'draft', repositoryStatus: 'draft' });
  const view = renderWriter();
  const titleInput = await view.findByLabelText("文章标题");
  await waitFor(() => expect(crepeState.creates).toBe(1));
  fireEvent.change(titleInput, { target: { value: "草稿测试" } });
  fireEvent.click(view.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(createContent).toHaveBeenCalled());
  expect(vi.mocked(createContent).mock.calls[0][0].status).toBe('draft');
  expect(submitMarkdownRenderJob).not.toHaveBeenCalled();
});

test("keeps the account draft when the content API cannot save the draft", async () => {
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  vi.mocked(createContent).mockRejectedValue(new Error('Content API unavailable'));
  const view = renderWriter();
  const titleInput = await view.findByLabelText("文章标题");
  await waitFor(() => expect(crepeState.creates).toBe(1));
  fireEvent.change(titleInput, { target: { value: "需要保留的原文" } });
  fireEvent.click(view.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(view.getByText(/创作中心保存失败，但原文已写入账号草稿/)).toBeTruthy());
  expect(vi.mocked(globalThis.fetch).mock.calls.some(([url, init]) =>
    String(url).includes('/api/rin-writer/draft') && init?.method === 'PUT')).toBe(true);
  expect(createContent).toHaveBeenCalled();
  expect(vi.mocked(createContent).mock.calls[0][0].body).toContain('需要保留的原文');
});

test("does not start publishing when the account draft cannot be saved", async () => {
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  const draftFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/api/rin-writer/draft') && init?.method === 'PUT') {
      return new Response(JSON.stringify({ message: 'Draft storage unavailable' }), { status: 503 });
    }
    return draftFetch(input, init);
  }));
  const view = renderWriter();
  const titleInput = await view.findByLabelText("文章标题");
  await waitFor(() => expect(crepeState.creates).toBe(1));
  fireEvent.change(titleInput, { target: { value: "先保存原文" } });
  fireEvent.click(view.getByRole("button", { name: "发布" }));

  await waitFor(() => expect(view.getByText(/账号草稿保存失败/)).toBeTruthy());
  expect(submitMarkdownRenderJob).not.toHaveBeenCalled();
  expect(createContent).not.toHaveBeenCalled();
});

test("saving changes to a published article keeps the public version intact", async () => {
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  vi.mocked(loadContentDetail).mockResolvedValue(savedMarkdownPost);
  const view = renderWriter('/write/markdown?edit=derived-categories');
  await waitFor(() => expect(crepeState.creates).toBe(1));
  crepeState.markdown = '# Derived categories\n\nUnpublished new revision.';
  act(() => crepeState.markdownUpdated(undefined, crepeState.markdown));
  fireEvent.click(view.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(view.getByText(/当前公开版本未改变/)).toBeTruthy());
  expect(updateContent).not.toHaveBeenCalled();
  expect(createContent).not.toHaveBeenCalled();
  expect(submitMarkdownRenderJob).not.toHaveBeenCalled();
});
