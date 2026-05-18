/**
 * Complete tool alias table for the Command Code provider.
 *
 * Maps alternative tool names from various LLM providers to the canonical
 * PI tool names. Also handles argument-level aliases (e.g., filePath -> path).
 */

/**
 * Tool name aliases: alternative name -> canonical PI tool name.
 */
export const TOOL_ALIASES: Record<string, string> = {
  read_file: "read",
  write_file: "write",
  edit_file: "edit",
  read_directory: "ls",
  shell_command: "bash",
  glob: "find",
  list_directory: "ls",
  search_files: "grep",
  create_file: "write",
  execute_command: "bash",
  cat: "read",
  find_files: "find",
  replace_in_file: "edit",
  search_code: "grep",
  search: "grep",
};

/**
 * Normalize tool arguments for a given tool name.
 *
 * Handles common argument aliases across different LLM providers:
 * - grep: filePattern -> glob
 * - read: absolutePath -> path
 * - write: filePath -> path
 * - edit: filePath -> path, oldValue/newValue -> edits[]
 * - bash: (passthrough)
 * - find: (passthrough)
 * - ls: (passthrough)
 */
export function normalizeToolArguments(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (name === "grep") {
    if (Object.hasOwn(args, "filePattern") && !Object.hasOwn(args, "glob")) {
      const { filePattern, ...rest } = args;
      return { ...rest, glob: filePattern };
    }
    return args;
  }

  if (name === "read") {
    if (Object.hasOwn(args, "absolutePath") && !Object.hasOwn(args, "path")) {
      const { absolutePath, ...rest } = args;
      return { ...rest, path: absolutePath };
    }
    return args;
  }

  if (name === "write") {
    if (Object.hasOwn(args, "filePath") && !Object.hasOwn(args, "path")) {
      const { filePath, ...rest } = args;
      return { ...rest, path: filePath };
    }
    return args;
  }

  if (name === "edit") {
    if (
      Object.hasOwn(args, "filePath") ||
      Object.hasOwn(args, "oldValue") ||
      Object.hasOwn(args, "newValue")
    ) {
      const {
        filePath,
        oldValue,
        newValue,
        replaceAll: _replaceAll,
        replacementCount: _replacementCount,
        ...rest
      } = args;
      // If edits array already provided, just remap filePath -> path
      if (Object.hasOwn(args, "edits")) {
        return { ...rest, path: typeof filePath === "string" ? filePath : rest.path };
      }
      // Convert oldValue/newValue pair to edits array
      if (typeof oldValue === "string" && typeof newValue === "string") {
        return {
          ...rest,
          path: typeof filePath === "string" ? filePath : rest.path,
          edits: [{ oldText: oldValue, newText: newValue }],
        };
      }
      return {
        ...rest,
        path: typeof filePath === "string" ? filePath : rest.path,
      };
    }
    return args;
  }

  return args;
}
