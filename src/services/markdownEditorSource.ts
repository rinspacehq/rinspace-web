import type { PostDetail } from "./feed";
import { syncGiteaSession } from "./gitea";
import { markdownBlogSource, markdownSourceFile } from "@/utils/blogBody";
import {
  bodyFromMarkdownBookProject,
  normalizeMarkdownBookProject,
  type MarkdownBookFile,
  type MarkdownBookLevel,
} from "@/utils/markdownBook";
import {
  markdownCatalogChapterID,
  parseMarkdownCatalog,
} from "@/utils/markdownCatalog";

export async function loadMarkdownEditorSource(
  post: PostDetail,
  signal?: AbortSignal,
) {
  if (post.repositorySource) {
    const source = post.repositorySource;
    const owner = post.type === "book" ? "b" : "a";
    const expectedPath = `/repos/${owner}/${encodeURIComponent(post.id)}/raw/commit/${source.commit}/${source.entrypoint.split("/").map(encodeURIComponent).join("/")}`;
    if (
      !/^[a-f0-9]{40}$/.test(source.commit) ||
      source.url !== expectedPath ||
      source.entrypoint !== "main.md" ||
      source.entrypoint
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error("Invalid repository source reference.");
    }
    await syncGiteaSession();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    let totalBytes = 0;
    const readSource = async (url: string) => {
      const response = await fetch(url, {
        redirect: "error",
        signal: controller.signal,
      });
      if (
        !response.ok ||
        response.headers.get("content-type")?.includes("text/html")
      ) {
        throw new Error("The repository source could not be loaded.");
      }
      const text = await response.text();
      totalBytes += new TextEncoder().encode(text).byteLength;
      if (totalBytes > 8 * 1024 * 1024)
        throw new Error("The repository source is too large.");
      return text;
    };
    try {
      const main = await readSource(source.url);
      if (post.type !== "book") return main;
      const catalog = parseMarkdownCatalog(main);
      const files: MarkdownBookFile[] = new Array(catalog.length);
      let next = 0;
      // Bound requests while keeping the original catalog order, never directory order.
      await Promise.all(
        Array.from({ length: Math.min(4, catalog.length) }, async () => {
          while (next < catalog.length) {
            const index = next++;
            const entry = catalog[index];
            const body = await readSource(
              source.url.slice(0, -"main.md".length) +
                entry.path.split("/").map(encodeURIComponent).join("/"),
            );
            files[index] = {
              id: await markdownCatalogChapterID(entry.path),
              path: entry.path,
              title: entry.path.split("/").at(-1)!.slice(0, -3),
              body,
              level: (entry.depth + 1) as MarkdownBookLevel,
            };
          }
        }),
      );
      const ancestors: string[] = [];
      files.forEach((file, index) => {
        const depth = catalog[index].depth;
        file.parentId = depth > 1 ? ancestors[depth - 2] : undefined;
        ancestors.length = depth - 1;
        ancestors.push(file.id);
      });
      return bodyFromMarkdownBookProject(
        normalizeMarkdownBookProject(
          { files },
          post.book?.bookTitle || post.title,
        ),
      );
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  const embedded = markdownBlogSource(post.body);
  if (embedded) return embedded;
  const file = markdownSourceFile(post);
  if (!file) return "";
  const response = await fetch(file.url);
  return response.ok ? response.text() : "";
}
