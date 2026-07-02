import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Editor from "../pages/Editor";
import { api } from "../api";
import type { Project, ProjectFile, CompileResult } from "../api";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  loader: { config: vi.fn() },
}));
vi.mock("../monacoSetup", () => ({
  setupLatexValidation: vi.fn(),
  revalidateSpell: vi.fn(),
}));
vi.mock("../spellCheck", () => ({
  getSpellLang: () => "off",
  setSpellLang: vi.fn(),
}));

const mockProject: Project = {
  id: "proj-1",
  name: "Test Project",
  main_path: "main.tex",
  shell_escape: false,
  engine: "auto",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mainFile: ProjectFile = {
  path: "main.tex",
  content: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
  is_binary: false,
};

const mdFile: ProjectFile = {
  path: "notes.md",
  content: "# Title\n\nSome **bold** text and a [link](https://example.com).",
  is_binary: false,
};

const mockFiles = [mainFile, mdFile];
const mockCompile: CompileResult = { ok: true, log: "" };

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/projects/proj-1"]}>
      <Routes>
        <Route path="/projects/:id" element={<Editor />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "listProjects").mockResolvedValue([mockProject]);
  vi.spyOn(api, "listFiles").mockResolvedValue(mockFiles);
  vi.spyOn(api, "saveFile").mockResolvedValue(undefined as unknown as Response);
  vi.spyOn(api, "compile").mockResolvedValue(mockCompile);
  vi.spyOn(api, "pdfUrl").mockImplementation(
    (id, bust) => `/api/projects/${id}/pdf?t=${bust}`
  );
});

describe("Editor markdown preview", () => {
  it("renders sanitized markdown in the preview pane when a .md file is open", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");

    fireEvent.click(screen.getByText("notes.md"));

    // heading and bold text rendered from markdown source
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Title" })).toBeVisible()
    );
    expect(screen.getByText("bold")).toBeVisible();

    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("toggles the preview off and back on with the Hide/Show preview button", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");
    fireEvent.click(screen.getByText("notes.md"));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Title" })).toBeVisible()
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByRole("heading", { name: "Title" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Title" })).toBeVisible()
    );
  });

  it("re-renders the preview as the markdown source is edited", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");
    fireEvent.click(screen.getByText("notes.md"));

    const editor = await screen.findByTestId("monaco-editor");
    fireEvent.change(editor, { target: { value: "# Changed Heading" } });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Changed Heading" })).toBeVisible()
    );
    expect(screen.queryByRole("heading", { name: "Title" })).not.toBeInTheDocument();
  });

  it("sanitizes unsafe markdown/HTML so scripts are not rendered", async () => {
    vi.spyOn(api, "listFiles").mockResolvedValue([
      mainFile,
      {
        path: "unsafe.md",
        content: "Hello <script>window.__pwned = true</script> world",
        is_binary: false,
      },
    ]);
    renderEditor();
    await screen.findByTestId("monaco-editor");

    fireEvent.click(screen.getByText("unsafe.md"));

    const preview = await waitFor(() => {
      const el = document.querySelector(".markdown-preview");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(preview.textContent).toContain("Hello");
    expect(preview.querySelector("script")).not.toBeInTheDocument();
    expect((window as unknown as { __pwned?: unknown }).__pwned).toBeUndefined();
  });

  it("does not show the preview toggle for non-markdown files", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");

    expect(
      screen.queryByRole("button", { name: /preview/i })
    ).not.toBeInTheDocument();
  });
});
