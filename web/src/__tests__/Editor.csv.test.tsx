import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Editor from "../pages/Editor";
import { api } from "../api";
import type { Project, ProjectFile, CompileResult } from "../api";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: any) => (
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
  content: "name,age\nAlice,30\nBob,25",
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

let saveFile: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(api, "listProjects").mockResolvedValue([mockProject]);
  vi.spyOn(api, "listFiles").mockResolvedValue(mockFiles);
  saveFile = vi.spyOn(api, "saveFile").mockResolvedValue(undefined as any);
  vi.spyOn(api, "compile").mockResolvedValue(mockCompile);
  vi.spyOn(api, "pdfUrl").mockImplementation(
    (id, bust) => `/api/projects/${id}/pdf?t=${bust}`
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Editor CSV editing", () => {
  it("renders parsed CSV rows as an editable table", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");

    fireEvent.click(screen.getByText("data.csv"));

    expect(await screen.findByDisplayValue("name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("age")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
  });

  it("edits a cell and schedules a save with the updated CSV content", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");
    fireEvent.click(screen.getByText("data.csv"));

    const cell = await screen.findByDisplayValue("Alice");
    fireEvent.change(cell, { target: { value: "Alicia" } });

    expect(screen.getByDisplayValue("Alicia")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() =>
      expect(saveFile).toHaveBeenCalledWith(
        "proj-1",
        "data.csv",
        expect.stringContaining("Alicia")
      )
    );
  });

  it("adds a new row with '+ row' and persists it", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");
    fireEvent.click(screen.getByText("data.csv"));

    await screen.findByDisplayValue("Alice");
    const before = screen.getAllByRole("textbox").length;

    fireEvent.click(screen.getByText("+ row"));

    await waitFor(() =>
      expect(screen.getAllByRole("textbox").length).toBe(before + 2)
    );

    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    const lastCall = saveFile.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("proj-1");
    expect(lastCall[1]).toBe("data.csv");
    expect(lastCall[2].trim().split("\n")).toHaveLength(4);
  });

  it("deletes a row with the row delete button and persists the change", async () => {
    renderEditor();
    await screen.findByTestId("monaco-editor");
    fireEvent.click(screen.getByText("data.csv"));

    await screen.findByDisplayValue("Bob");

    const deleteButtons = screen.getAllByTitle("Delete row");
    // delete the row containing "Bob" (third row, index 2)
    fireEvent.click(deleteButtons[2]);

    await waitFor(() =>
      expect(screen.queryByDisplayValue("Bob")).not.toBeInTheDocument()
    );
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    const lastCall = saveFile.mock.calls.at(-1)!;
    expect(lastCall[2]).not.toContain("Bob");
    expect(lastCall[2]).toContain("Alice");
  });
});
