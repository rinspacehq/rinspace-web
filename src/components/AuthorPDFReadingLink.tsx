import { useEffect, useState } from "react";
import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";

const maxBytes = 4 * 1024 * 1024;
export type AuthorPDF = {
  base64: string;
  sha256: string;
  pageCount: number;
  commit: string;
  path: string;
};

// A PDF reading result is a single renderer-owned node, never arbitrary HTML
// containing a marker somewhere inside it. This does not relax HTML sanitizing.
export function authorPDFFromFragment(fragment: string): AuthorPDF | null {
  if (
    fragment.length > Math.ceil(maxBytes / 3) * 4 + 4096 ||
    !fragment.includes('class="rin-author-pdf"')
  )
    return null;
  const document = new DOMParser().parseFromString(fragment, "text/html");
  const element = document.body.firstElementChild;
  if (
    document.body.children.length !== 1 ||
    element?.tagName !== "DIV" ||
    element.className !== "rin-author-pdf"
  )
    return null;
  const base64 = element.getAttribute("data-rin-pdf") || "";
  const sha256 = element.getAttribute("data-rin-pdf-sha256") || "";
  const pageCount = Number(element.getAttribute("data-rin-pdf-pages"));
  const commit = element.getAttribute("data-rin-pdf-commit") || "";
  const path = element.getAttribute("data-rin-pdf-path") || "";
  if (
    !base64 ||
    base64.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(commit) ||
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > 10000 ||
    !path.endsWith(".pdf") ||
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === ".." || part === ".") ||
    path.includes("\\")
  )
    return null;
  return { base64, sha256, pageCount, commit, path };
}

export async function verifiedAuthorPDFBytes(
  pdf: AuthorPDF,
): Promise<Uint8Array> {
  const binary = atob(pdf.base64);
  if (binary.length > maxBytes || !binary.startsWith("%PDF-"))
    throw new Error("Invalid PDF");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (
    Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("") !==
    pdf.sha256
  )
    throw new Error("PDF identity mismatch");
  return bytes;
}

export function useAuthorPDFURL(pdf: AuthorPDF) {
  const [url, setURL] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectURL = "";
    setURL("");
    setError(false);
    void verifiedAuthorPDFBytes(pdf)
      .then((bytes) => {
        if (!active) return;
        objectURL = URL.createObjectURL(
          new Blob([bytes.slice().buffer], { type: "application/pdf" }),
        );
        setURL(objectURL);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [pdf]);
  return { url, error };
}

export default function AuthorPDFReadingLink({
  pdf,
  className,
}: {
  pdf: AuthorPDF;
  className?: string;
}) {
  const { t } = useFeatureTranslation("reader");
  const { url, error } = useAuthorPDFURL(pdf);
  return (
    <span data-rin-reading-mode="author-pdf" data-source-commit={pdf.commit}>
      {error ? (
        <span role="alert">{t("pdfReading.error")}</span>
      ) : url ? (
        <a
          className={className || "rin-ui-button rin-animate-button"}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          type="application/pdf"
        >
          {t("pdfReading.startReading")}
        </a>
      ) : (
        <span role="status">{t("pdfReading.loading")}</span>
      )}
    </span>
  );
}
