import { test, expect, type Page } from "@playwright/test";

const PROJECT = {
  id: "proj-mc1",
  name: "Markdown & CSV Project",
  main_path: "main.tex",
  shell_escape: false,
  engine: "auto",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-06-01T10:00:00Z",
};

const FILES = [
  {
    path: "main.tex",
    content: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
    is_binary: false,
    updated_at: "2024-06-01T10:00:00Z",
  },
  {
    path: "notes.md",
    content: "# Title\n\nSome **bold** text and a [link](https://example.com).",
    is_binary: false,
    updated_at: "2024-06-01T09:30:00Z",
  },
  {
    path: "data.csv",
    content: "name,age\nAlice,30\nBob,25",
    is_binary: false,
    updated_at: "2024-06-01T09:00:00Z",
  },
];

async function mockEditorApi(page: Page) {
  await page.route("/api/projects", async (route) => {
    await route.fulfill({ json: [PROJECT] });
  });

  await page.route("/api/projects/proj-mc1/files", async (route) => {
    await route.fulfill({ json: FILES });
  });

  await page.route("/api/projects/proj-mc1/files/**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 200, body: "" });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
    }
  });

  await page.route("/api/projects/proj-mc1", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { ...PROJECT, ...body } });
  });

  await page.route("/api/projects/proj-mc1/compile", async (route) => {
    await route.fulfill({ json: { ok: true, log: "Output written on main.pdf." } });
  });

  await page.route("/api/projects/proj-mc1/pdf**", async (route) => {
    await route.fulfill({ status: 200, body: "%PDF-1.4 mock" });
  });
}

test.describe("Editor — Markdown preview", () => {
  test("shows rendered markdown preview by default when opening a .md file", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-mc1");

    await page.locator("button", { hasText: "notes.md" }).click();

    await expect(page.getByRole("heading", { name: "Title" })).toBeVisible();
    await expect(page.locator(".markdown-preview strong", { hasText: "bold" })).toBeVisible();
    await expect(page.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.com"
    );
  });

  test("toggles between rendered preview and raw source", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-mc1");

    await page.locator("button", { hasText: "notes.md" }).click();
    await expect(page.getByRole("heading", { name: "Title" })).toBeVisible();

    await page.getByRole("button", { name: "Hide preview" }).click();
    await expect(page.getByRole("heading", { name: "Title" })).not.toBeVisible();

    await page.getByRole("button", { name: "Show preview" }).click();
    await expect(page.getByRole("heading", { name: "Title" })).toBeVisible();
  });

  test("does not show a preview toggle for non-markdown files", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-mc1");

    await expect(page.getByRole("button", { name: /preview/i })).toHaveCount(0);
  });
});

test.describe("Editor — CSV editing", () => {
  test("renders CSV content as an editable table", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-mc1");

    await page.locator("button", { hasText: "data.csv" }).click();

    await expect(page.locator("input[value='name']")).toBeVisible();
    await expect(page.locator("input[value='Alice']")).toBeVisible();
    await expect(page.locator("input[value='Bob']")).toBeVisible();
  });

  test("editing a cell persists the updated CSV via save", async ({ page }) => {
    await mockEditorApi(page);

    let savedBody: string | undefined;
    await page.route("/api/projects/proj-mc1/files/**", async (route) => {
      if (route.request().method() === "PUT") {
        savedBody = route.request().postData() ?? undefined;
        await route.fulfill({ status: 200, body: "" });
      } else if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204, body: "" });
      }
    });

    await page.goto("/p/proj-mc1");
    await page.locator("button", { hasText: "data.csv" }).click();

    const cell = page.locator("input[value='Alice']");
    await cell.fill("Alicia");

    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });
    expect(savedBody).toContain("Alicia");
  });

  test("adds a new row with the '+ row' button", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-mc1");
    await page.locator("button", { hasText: "data.csv" }).click();

    const rowsBefore = await page.locator("table tr").count();
    await page.getByRole("button", { name: "+ row" }).click();

    await expect(page.locator("table tr")).toHaveCount(rowsBefore + 1);
  });

  test("deletes a row via the row delete button", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-mc1");
    await page.locator("button", { hasText: "data.csv" }).click();

    await expect(page.locator("input[value='Bob']")).toBeVisible();

    const bobRow = page.locator("table tr").filter({ has: page.locator("input[value='Bob']") });
    await bobRow.hover();
    await bobRow.getByTitle("Delete row").click();

    await expect(page.locator("input[value='Bob']")).toHaveCount(0);
    await expect(page.locator("input[value='Alice']")).toBeVisible();
  });
});
