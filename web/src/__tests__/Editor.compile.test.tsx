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

const csvFile: ProjectFile = {
  path: "data.csv",
  content: "a,b\n1,2",
  is_binary: false,
};

const mockFiles = [mainFile, csvFile];
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

describe("Editor compile switches to main file", () => {
  it("switches active file to project main_path and shows the PDF preview, even when a non-main file (csv) is open", async () => {
    renderEditor();

    // wait for initial load (main.tex selected by default)
    await screen.findByTestId("monaco-editor");

    // open the csv file instead
    fireEvent.click(screen.getByText("data.csv"));
    expect(await screen.findByText("+ row")).toBeInTheDocument();

    // compile
    fireEvent.click(screen.getByRole("button", { name: /compile/i }));

    await waitFor(() => expect(api.compile).toHaveBeenCalledWith("proj-1"));

    // active file switched to main.tex: csv table gone, monaco shows main content
    await waitFor(() =>
      expect(screen.queryByText("+ row")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("monaco-editor")).toHaveValue(mainFile.content);

    // preview pane now renders the PDF iframe for the compiled document
    await waitFor(() =>
      expect(screen.getByTitle("pdf")).toHaveAttribute(
        "src",
        expect.stringContaining("/api/projects/proj-1/pdf?t=")
      )
    );
  });

  it("does not switch the active file when the main file is already open", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");
    expect(screen.getByTestId("monaco-editor")).toHaveValue(mainFile.content);

    fireEvent.click(screen.getByRole("button", { name: /compile/i }));

    await waitFor(() => expect(api.compile).toHaveBeenCalledWith("proj-1"));
    expect(screen.getByTestId("monaco-editor")).toHaveValue(mainFile.content);
  });
});
