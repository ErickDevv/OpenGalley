import { test, expect, type Page } from "@playwright/test";

const PROJECT_1 = {
  id: "proj-1",
  name: "My Thesis",
  main_path: "main.tex",
  shell_escape: false,
  engine: "auto",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-06-01T10:00:00Z",
};

const PROJECT_2 = {
  id: "proj-2",
  name: "Conference Paper",
  main_path: "paper.tex",
  shell_escape: false,
  engine: "pdflatex",
  created_at: "2024-02-01T00:00:00Z",
  updated_at: "2024-06-02T12:00:00Z",
};

async function mockApi(page: Page, projects = [PROJECT_1, PROJECT_2]) {
  await page.route("/api/projects", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: projects });
    } else if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          id: "new-proj",
          name: body.name,
          main_path: "main.tex",
          shell_escape: false,
          engine: "auto",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    }
  });

  await page.route("/api/projects/reorder", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("/api/projects/proj-1", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { ...PROJECT_1, ...body } });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
    }
  });

  await page.route("/api/projects/proj-2", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
    }
  });
}

test.describe("Dashboard", () => {
  test("shows project list on load", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByText("My Thesis")).toBeVisible();
    await expect(page.getByText("Conference Paper")).toBeVisible();
  });

  test("shows empty state when no projects", async ({ page }) => {
    await mockApi(page, []);
    await page.goto("/");

    await expect(page.getByText("No projects yet.")).toBeVisible();
    await expect(page.getByText("Create your first project")).toBeVisible();
  });

  test("shows app header with OpenGalley branding", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByText("OpenGalley")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import project" })).toBeVisible();
  });

  test("navigates to editor on project click", async ({ page }) => {
    await mockApi(page);
    await page.route("/api/projects/proj-1/files", async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto("/");

    await page.getByText("My Thesis").click();
    await expect(page).toHaveURL(/\/p\/proj-1/);
  });

  test("opens import modal on Import project click", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Import project" }).first().click();

    await expect(page.getByRole("heading", { name: "Import project" })).toBeVisible();
    await expect(page.getByText("Drop .zip or folder here")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pick .zip file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pick folder" })).toBeVisible();
  });

  test("closes import modal on backdrop click", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Import project" }).first().click();
    await expect(page.getByText("Drop .zip or folder here")).toBeVisible();

    // Click backdrop (outside the modal panel)
    await page.mouse.click(10, 10);
    await expect(page.getByText("Drop .zip or folder here")).not.toBeVisible();
  });

  test("closes import modal on ✕ button", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Import project" }).first().click();
    await page.getByRole("button", { name: "✕" }).click();
    await expect(page.getByText("Drop .zip or folder here")).not.toBeVisible();
  });

  test("renames project via Rename button", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    // Cards have draggable+cursor-grab so hover needs force to bypass actionability checks
    const card = page.locator(".group").filter({ hasText: "My Thesis" }).first();
    await card.hover({ force: true });
    await card.getByRole("button", { name: "Rename" }).click({ force: true });

    const input = page.locator(".group input").first();
    await expect(input).toBeVisible();
    await input.fill("Renamed Thesis");
    await input.press("Enter");

    await expect(page.getByText("Renamed Thesis")).toBeVisible();
  });

  test("cancels rename on Escape", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const card = page.locator(".group").filter({ hasText: "My Thesis" }).first();
    await card.hover({ force: true });
    await card.getByRole("button", { name: "Rename" }).click({ force: true });

    const input = page.locator(".group input").first();
    await input.fill("Should Not Save");
    await input.press("Escape");

    await expect(page.locator("h3", { hasText: "My Thesis" })).toBeVisible();
    await expect(page.getByText("Should Not Save")).not.toBeVisible();
  });

  test("shows rename button on hover", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    // force skips actionability checks needed for draggable cards
    const card = page.locator(".group").filter({ hasText: "My Thesis" }).first();
    await card.hover({ force: true });

    await expect(card.getByRole("button", { name: "Rename" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  test("deletes project after confirmation", async ({ page }) => {
    // Mutable closure — safe under React StrictMode double-effect
    let projectList = [PROJECT_1, PROJECT_2];

    await page.route("/api/projects", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: projectList });
      }
    });
    await page.route("/api/projects/proj-1", async (route) => {
      if (route.request().method() === "DELETE") {
        projectList = [PROJECT_2];
        await route.fulfill({ status: 204, body: "" });
      } else if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        await route.fulfill({ json: { ...PROJECT_1, ...body } });
      }
    });

    await page.goto("/");

    page.once("dialog", (dialog) => dialog.accept());

    const card = page.locator(".group").filter({ hasText: "My Thesis" }).first();
    await card.hover({ force: true });
    await card.getByRole("button", { name: "Delete" }).click({ force: true });

    await expect(page.locator("h3", { hasText: "My Thesis" })).not.toBeVisible();
    await expect(page.getByText("Conference Paper")).toBeVisible();
  });
});
