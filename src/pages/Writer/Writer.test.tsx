import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ToastProvider } from "components/ui";
import { ensureLocaleNamespaces, i18n } from "@/i18n";
import { getCurrentUser } from "@/services/profile";
import { loadRinSdk } from "@/utils/rinWriter";

import WriterPage from "./index";

const typstFeatureState = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/features/publish/typstFeature", () => ({
  get typstCreationEnabled() {
    return typstFeatureState.enabled;
  },
}));

vi.mock("@/components/SiteTopbarShell", () => ({ default: () => null }));
vi.mock("@/components/ImageCropDialog", () => ({ default: () => null }));
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
  hasAuthSession: vi.fn(() => true),
}));
vi.mock("@/services/domains/article", () => ({
  createContent: vi.fn(),
  updateContent: vi.fn(),
  loadContentDetail: vi.fn(),
  isContentModerationSubmission: () => false,
}));
vi.mock("@/services/domains/book", () => ({ attachBookChapterLink: vi.fn() }));
vi.mock("@/services/domains/identity", () => ({ moveWorkItem: vi.fn() }));
vi.mock("@/services/domains/publication", () => ({
  uploadAnswerFile: vi.fn(),
}));

const editor = {
  ready: Promise.resolve(undefined as unknown),
  importArchive: vi.fn().mockResolvedValue(undefined),
  save: vi.fn(),
  exportBundle: vi.fn(),
  getTitle: vi.fn().mockResolvedValue(""),
  setTitle: vi.fn().mockResolvedValue(undefined),
  getActiveFile: vi.fn().mockResolvedValue({
    path: "main.tex",
    kind: "tex",
    body: "\\section{未保存的作者源码}",
  }),
  getFiles: vi
    .fn()
    .mockResolvedValue([
      { path: "main.tex", kind: "tex", body: "\\section{未保存的作者源码}" },
    ]),
  getMainFile: vi.fn().mockResolvedValue("main.tex"),
  setProject: vi.fn().mockResolvedValue(undefined),
  setView: vi.fn().mockResolvedValue(undefined),
  insertText: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};
editor.ready = Promise.resolve(editor);
editor.on.mockImplementation(() => editor);
editor.off.mockImplementation(() => editor);

vi.mock("@/utils/rinWriter", async () => {
  const actual =
    await vi.importActual<typeof import("@/utils/rinWriter")>(
      "@/utils/rinWriter",
    );
  return {
    ...actual,
    loadRinSdk: vi.fn(),
    fileFromLatexTemplate: vi
      .fn()
      .mockResolvedValue(
        new File(["template"], "latex-article.tar.gz", {
          type: "application/gzip",
        }),
      ),
  };
});

function renderWriter(path = "/write") {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/write" element={<WriterPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  typstFeatureState.enabled = false;
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  vi.mocked(loadRinSdk).mockReset();
  vi.mocked(loadRinSdk).mockResolvedValue({
    create: vi.fn(() => editor),
  } as never);
  editor.importArchive.mockClear();
  editor.getTitle.mockClear();
  editor.setTitle.mockClear();
  editor.destroy.mockClear();
  editor.on.mockClear();
  editor.off.mockClear();
  editor.on.mockImplementation(() => editor);
  editor.off.mockImplementation(() => editor);
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
});

test("switches LaTeX writer controls without rebuilding the editor or losing the title", async () => {
  await ensureLocaleNamespaces("en", ["creation"]);
  await ensureLocaleNamespaces("zh-CN", ["creation"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = renderWriter();
  const titleInput = await view.findByLabelText("Article title");
  fireEvent.change(titleInput, { target: { value: "未提交的射影几何笔记" } });
  await waitFor(() => expect(loadRinSdk).toHaveBeenCalledTimes(1));

  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  expect((view.getByLabelText("文章标题") as HTMLInputElement).value).toBe(
    "未提交的射影几何笔记",
  );
  expect(view.getByLabelText("Rin 编辑器")).toBeTruthy();
  expect(loadRinSdk).toHaveBeenCalledTimes(1);
  expect(editor.destroy).not.toHaveBeenCalled();
  expect(document.title).toBe("LaTeX 写作 · 芥子环");
});

test("renders the English book writer actions", async () => {
  await ensureLocaleNamespaces("en", ["creation"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = renderWriter("/write?mode=book");

  expect(await view.findByLabelText("Book title")).toBeTruthy();
  expect(view.getByText("Merge import")).toBeTruthy();
  expect(view.getByText("Replace project")).toBeTruthy();
  expect(view.getByRole("button", { name: "Publish book" })).toBeTruthy();
  expect(document.title).toBe("LaTeX book writing · Rinspace");
});

test("keeps the direct Typst blog route closed and falls back to the LaTeX writer", async () => {
  await ensureLocaleNamespaces("en", ["creation"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });

  const view = renderWriter("/write?kind=typst");

  expect(await view.findByLabelText("Article title")).toBeTruthy();
  expect(
    view.queryByRole("heading", { name: "Create Typst article" }),
  ).toBeNull();
});

test("opens the Typst blog creation dialog from the direct route when enabled", async () => {
  await ensureLocaleNamespaces("en", ["creation"]);
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  typstFeatureState.enabled = true;

  const view = renderWriter("/write?kind=typst");

  expect(
    await view.findByRole("heading", { name: "Create Typst article" }),
  ).toBeTruthy();
});
