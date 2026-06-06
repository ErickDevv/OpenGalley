export interface MarkerData {
  severity: "error" | "warning";
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export function analyzeLatex(text: string): MarkerData[] {
  const markers: MarkerData[] = [];
  const lines = text.split("\n");

  const braceStack: { line: number; col: number }[] = [];
  const envStack: { name: string; line: number; col: number }[] = [];

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    let line = raw;
    for (let ci = 0; ci < raw.length; ci++) {
      if (raw[ci] === "%" && (ci === 0 || raw[ci - 1] !== "\\")) {
        line = raw.substring(0, ci);
        break;
      }
    }

    let i = 0;
    while (i < line.length) {
      const ch = line[i];

      if (ch === "\\") {
        if (i + 1 < line.length && /[{}$%\\]/.test(line[i + 1])) {
          i += 2;
          continue;
        }
        const envMatch = line.slice(i).match(/^\\(begin|end)\s*\{([^}]*)\}/);
        if (envMatch) {
          const kind = envMatch[1];
          const envName = envMatch[2].trim();
          if (kind === "begin") {
            envStack.push({ name: envName, line: li, col: i });
          } else {
            if (envStack.length === 0) {
              markers.push({
                severity: "error",
                message: `\\end{${envName}} has no matching \\begin`,
                startLineNumber: li + 1,
                startColumn: i + 1,
                endLineNumber: li + 1,
                endColumn: i + envMatch[0].length + 1,
              });
            } else {
              const top = envStack[envStack.length - 1];
              if (top.name !== envName) {
                markers.push({
                  severity: "error",
                  message: `Expected \\end{${top.name}}, got \\end{${envName}}`,
                  startLineNumber: li + 1,
                  startColumn: i + 1,
                  endLineNumber: li + 1,
                  endColumn: i + envMatch[0].length + 1,
                });
              } else {
                envStack.pop();
              }
            }
          }
          i += envMatch[0].length;
          continue;
        }
        i++;
        while (i < line.length && /[a-zA-Z@*]/.test(line[i])) i++;
        continue;
      }

      if (ch === "{") {
        braceStack.push({ line: li, col: i });
        i++;
        continue;
      }

      if (ch === "}") {
        if (braceStack.length === 0) {
          markers.push({
            severity: "error",
            message: "Unmatched }",
            startLineNumber: li + 1,
            startColumn: i + 1,
            endLineNumber: li + 1,
            endColumn: i + 2,
          });
        } else {
          braceStack.pop();
        }
        i++;
        continue;
      }

      i++;
    }
  }

  for (const b of braceStack) {
    markers.push({
      severity: "error",
      message: "Unclosed {",
      startLineNumber: b.line + 1,
      startColumn: b.col + 1,
      endLineNumber: b.line + 1,
      endColumn: b.col + 2,
    });
  }

  for (const env of envStack) {
    markers.push({
      severity: "warning",
      message: `Unclosed \\begin{${env.name}}`,
      startLineNumber: env.line + 1,
      startColumn: env.col + 1,
      endLineNumber: env.line + 1,
      endColumn: env.col + env.name.length + 8,
    });
  }

  return markers;
}
