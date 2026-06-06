import { test, expect, type Page } from "@playwright/test";

const PROJECT = {
  id: "proj-e1",
  name: "Sample Paper",
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
    path: "refs.bib",
    content: "@article{key, title={A paper}}",
    is_binary: false,
    updated_at: "2024-06-01T09:00:00Z",
  },
  {
    path: "fig.png",
    content: null,
    is_binary: true,
    updated_at: "2024-06-01T08:00:00Z",
  },
];

async function mockEditorApi(page: Page) {
  await page.route("/api/projects", async (route) => {
    await route.fulfill({ json: [PROJECT] });
  });

  await page.route("/api/projects/proj-e1/files", async (route) => {
    await route.fulfill({ json: FILES });
  });

  await page.route("/api/projects/proj-e1/files/**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 200, body: "" });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
    }
  });

  await page.route("/api/projects/proj-e1", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { ...PROJECT, ...body } });
  });

  await page.route("/api/projects/proj-e1/compile", async (route) => {
    await route.fulfill({
      json: { ok: true, log: "Output written on main.pdf." },
    });
  });

  await page.route("/api/projects/proj-e1/pdf**", async (route) => {
    await route.fulfill({ status: 200, body: "%PDF-1.4 mock" });
  });
}

test.describe("Editor", () => {
  test("renders project name in header", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByText("Sample Paper")).toBeVisible();
  });

  test("shows back navigation to projects", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByText("← Projects")).toBeVisible();
  });

  test("navigates back to dashboard on ← Projects click", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await page.getByText("← Projects").click();
    await expect(page).toHaveURL("/");
  });

  test("displays file tree with all files", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByText("main.tex")).toBeVisible();
    await expect(page.getByText("refs.bib")).toBeVisible();
    await expect(page.getByText("fig.png")).toBeVisible();
  });

  test("marks main file in file tree", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    // The yellow "main" badge is a <span> beside the main file entry
    await expect(page.locator(".text-yellow-500", { hasText: "main" })).toBeVisible();
  });

  test("shows engine selector with auto selected", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    const select = page.locator("select[title*='LaTeX engine']");
    await expect(select).toHaveValue("auto");
  });

  test("shows shell-escape toggle button", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByText(/shell-escape: off/)).toBeVisible();
  });

  test("shows Compile button", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByRole("button", { name: "Compile" })).toBeVisible();
  });

  test("shows Log and Download PDF buttons", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByRole("button", { name: "Log" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
  });

  test("Download PDF disabled before compile", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    const dlBtn = page.getByRole("button", { name: "Download PDF" });
    await expect(dlBtn).toBeDisabled();
  });

  test("compile shows Compiling... then enables Download PDF", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await page.getByRole("button", { name: "Compile" }).click();

    // After successful compile, Download PDF should become enabled
    const dlBtn = page.getByRole("button", { name: "Download PDF" });
    await expect(dlBtn).not.toBeDisabled({ timeout: 5000 });
  });

  test("toggles log panel", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    // Compile first to get a log
    await page.getByRole("button", { name: "Compile" }).click();
    await page.getByRole("button", { name: "Download PDF" }).waitFor({ state: "visible" });

    // Log panel should be hidden after successful compile
    const logPanel = page.locator("pre");
    await expect(logPanel).not.toBeVisible();

    // Toggle log open
    await page.getByRole("button", { name: "Log" }).click();
    await expect(logPanel).toBeVisible();

    // Toggle log closed
    await page.getByRole("button", { name: "Log" }).click();
    await expect(logPanel).not.toBeVisible();
  });

  test("switching file in tree updates active highlight", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    const refsBib = page.locator("button", { hasText: "refs.bib" });
    await refsBib.click();

    // The refs.bib row should be highlighted (bg-white/10 class)
    const refRow = page.locator("li").filter({ hasText: "refs.bib" }).locator("div").first();
    await expect(refRow).toHaveClass(/bg-white\/10/);
  });

  test("shows empty PDF preview placeholder before compile", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await expect(page.getByText("Compile to see the PDF preview.")).toBeVisible();
  });

  test("PDF iframe appears after successful compile", async ({ page }) => {
    await mockEditorApi(page);
    await page.goto("/p/proj-e1");

    await page.getByRole("button", { name: "Compile" }).click();
    await page.getByRole("button", { name: "Download PDF" }).waitFor({ state: "visible" });

    const pdfFrame = page.locator("iframe[title='pdf']");
    await expect(pdfFrame).toBeVisible();
  });

  test("shows failed compile log on error", async ({ page }) => {
    await mockEditorApi(page);
    await page.route("/api/projects/proj-e1/compile", async (route) => {
      await route.fulfill({ json: { ok: false, log: "! Undefined control sequence." } });
    });
    await page.goto("/p/proj-e1");

    await page.getByRole("button", { name: "Compile" }).click();

    await expect(page.locator("pre")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("pre")).toContainText("Undefined control sequence");
  });

  test("engine selector changes project engine", async ({ page }) => {
    await mockEditorApi(page);
    let patchedEngine: string | undefined;
    await page.route("/api/projects/proj-e1", async (route) => {
      const body = route.request().postDataJSON();
      patchedEngine = body?.engine;
      await route.fulfill({ json: { ...PROJECT, engine: body?.engine ?? PROJECT.engine } });
    });
    await page.goto("/p/proj-e1");

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/projects/proj-e1") && r.request().method() === "PATCH",
    );
    await page.locator("select[title*='LaTeX engine']").selectOption("xelatex");
    await responsePromise;
    expect(patchedEngine).toBe("xelatex");
  });
});
