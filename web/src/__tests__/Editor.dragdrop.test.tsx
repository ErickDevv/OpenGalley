import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Editor, { DRAG_MIME } from "../pages/Editor";
import { api } from "../api";
import * as upload from "../upload";
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

const noteFile: ProjectFile = {
  path: "notes.txt",
  content: "todo",
  is_binary: false,
};

const folderMarker: ProjectFile = {
  path: "images/.gitkeep",
  content: "",
  is_binary: false,
};

const initialFiles = [mainFile, noteFile, folderMarker];
const movedFiles = [
  mainFile,
  folderMarker,
  { ...noteFile, path: "images/notes.txt" },
];
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

// A minimal DataTransfer stand-in that persists data across dragstart/dragover/drop,
// like the real DataTransfer object does throughout a single drag gesture.
function fakeDataTransfer(initialTypes: string[] = []) {
  const store: Record<string, string> = {};
  const types = new Set(initialTypes);
  return {
    effectAllowed: "",
    get types() {
      return Array.from(types);
    },
    setData: (type: string, value: string) => {
      store[type] = value;
      types.add(type);
    },
    getData: (type: string) => store[type] ?? "",
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(api, "listProjects").mockResolvedValue([mockProject]);
  vi.spyOn(api, "compile").mockResolvedValue(mockCompile);
  vi.spyOn(api, "pdfUrl").mockImplementation(
    (id, bust) => `/api/projects/${id}/pdf?t=${bust}`
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Editor drag and drop", () => {
  it("moves a file into a folder via internal drag", async () => {
    vi.spyOn(api, "listFiles")
      .mockResolvedValueOnce(initialFiles)
      .mockResolvedValueOnce(movedFiles);
    const renameFile = vi
      .spyOn(api, "renameFile")
      .mockResolvedValue({ ok: true, count: 1 });

    renderEditor();
    await screen.findByTitle("notes.txt");
    const fileRow = screen.getByTitle("notes.txt").closest("div")!;
    const folderRow = screen.getByTitle("images").closest("div")!;

    const dt = fakeDataTransfer();
    fireEvent.dragStart(fileRow, { dataTransfer: dt });
    fireEvent.dragOver(folderRow, { dataTransfer: dt });
    fireEvent.drop(folderRow, { dataTransfer: dt });

    await waitFor(() =>
      expect(renameFile).toHaveBeenCalledWith(
        "proj-1",
        "notes.txt",
        "images/notes.txt"
      )
    );
  });

  it("does not move a file dropped onto its own parent folder", async () => {
    vi.spyOn(api, "listFiles").mockResolvedValue(initialFiles);
    const renameFile = vi
      .spyOn(api, "renameFile")
      .mockResolvedValue({ ok: true, count: 1 });

    renderEditor();
    await screen.findByTitle("notes.txt");
    const fileRow = screen.getByTitle("notes.txt").closest("div")!;
    const panel = document.querySelector(".relative.flex.min-h-0.flex-1")!;

    const dt = fakeDataTransfer();
    fireEvent.dragStart(fileRow, { dataTransfer: dt });
    fireEvent.drop(panel, { dataTransfer: dt });

    // dropping a root file back onto the root is a no-op
    await new Promise((r) => setTimeout(r, 0));
    expect(renameFile).not.toHaveBeenCalled();
  });

  it("uploads an OS file dropped onto a folder with the folder as prefix", async () => {
    vi.spyOn(api, "listFiles").mockResolvedValue(initialFiles);
    vi.spyOn(upload, "itemsFromDrop").mockResolvedValue([
      { path: "diagram.png", data: "YWJj" },
    ]);
    const uploadBatch = vi
      .spyOn(api, "uploadBatch")
      .mockResolvedValue({ ok: true, count: 1 });

    renderEditor();
    await screen.findByTitle("images");
    const folderRow = screen.getByTitle("images").closest("div")!;

    const dt = fakeDataTransfer(["Files"]);
    fireEvent.drop(folderRow, { dataTransfer: dt });

    await waitFor(() =>
      expect(uploadBatch).toHaveBeenCalledWith("proj-1", [
        { path: "images/diagram.png", data: "YWJj" },
      ])
    );
  });

  it("does not show the upload overlay during an internal drag", async () => {
    vi.spyOn(api, "listFiles").mockResolvedValue(initialFiles);
    renderEditor();
    await screen.findByTitle("notes.txt");
    const panel = document.querySelector(".relative.flex.min-h-0.flex-1")!;

    fireEvent.dragOver(panel, { dataTransfer: fakeDataTransfer([DRAG_MIME]) });

    expect(
      screen.queryByText(/Drop files or a folder to add them/)
    ).not.toBeInTheDocument();
  });

  it("shows the upload overlay when an OS file is dragged over the panel", async () => {
    vi.spyOn(api, "listFiles").mockResolvedValue(initialFiles);
    renderEditor();
    await screen.findByTitle("notes.txt");
    const panel = document.querySelector(".relative.flex.min-h-0.flex-1")!;

    fireEvent.dragOver(panel, { dataTransfer: fakeDataTransfer(["Files"]) });

    expect(
      screen.getByText(/Drop files or a folder to add them/)
    ).toBeInTheDocument();
  });
});
