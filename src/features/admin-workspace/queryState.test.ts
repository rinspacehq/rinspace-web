import { describe, expect, it } from "vitest";

import {
  adminContentSectionSearchParams,
  adminReviewSearchParams,
  adminSystemSectionSearchParams,
  adminWorkspaceSearchParams,
  adminWorkspaceViewSearchParams,
  parseAdminWorkspaceQuery,
} from "./queryState";

describe("admin workspace query state", () => {
  it("uses safe defaults for missing and invalid values", () => {
    expect(
      parseAdminWorkspaceQuery(
        new URLSearchParams(
          "view=unknown&section=nope&source=bot&status=nope&page=-2&case=x",
        ),
      ),
    ).toEqual({
      view: "home",
      section: "blogs",
      source: "all",
      status: "active",
      page: 1,
      caseId: null,
      systemSection: "overview",
    });
  });

  it("serializes only state relevant to the active view", () => {
    expect(
      adminWorkspaceSearchParams({
        view: "content",
        section: "users",
        source: "report",
        status: "closed",
        page: 4,
        caseId: 88,
        systemSection: "overview",
      }).toString(),
    ).toBe("view=content&section=users");
    expect(
      adminWorkspaceSearchParams({
        view: "review",
        section: "users",
        source: "hybrid",
        status: "deferred",
        page: 4,
        caseId: 88,
        systemSection: "overview",
      }).toString(),
    ).toBe("view=review&source=hybrid&status=deferred&page=4&case=88");
  });

  it("cleans unrelated parameters when switching views", () => {
    const current = new URLSearchParams(
      "view=review&source=report&status=closed&page=3&case=42&noise=1",
    );
    expect(adminWorkspaceViewSearchParams(current, "home").toString()).toBe("");
    expect(adminWorkspaceViewSearchParams(current, "content").toString()).toBe(
      "view=content",
    );
    expect(adminWorkspaceViewSearchParams(current, "risk").toString()).toBe(
      "view=risk",
    );
    expect(adminSystemSectionSearchParams(current, "records").toString()).toBe(
      "view=system&system=records",
    );
  });

  it("keeps content and review state within their own view", () => {
    expect(
      adminContentSectionSearchParams(
        new URLSearchParams(),
        "cultivation",
      ).toString(),
    ).toBe("view=content&section=cultivation");
    const current = new URLSearchParams(
      "view=review&source=machine&status=pending&page=5",
    );
    expect(
      adminReviewSearchParams(current, { status: "deferred" }).toString(),
    ).toBe("view=review&source=machine&status=deferred");
    expect(adminReviewSearchParams(current, { caseId: 91 }).toString()).toBe(
      "view=review&source=machine&status=pending&page=5&case=91",
    );
  });
});
