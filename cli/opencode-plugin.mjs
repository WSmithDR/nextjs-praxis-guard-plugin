// cli/opencode-plugin.mjs
// Drop into <project>/.opencode/plugins/ (or ~/.config/opencode/plugins/).
// Adjust DETECT_PATH to where nextjs-praxis-guard is installed.
import { runDetector } from "../../hooks/detect.mjs"; // <- installer rewrites this path

export const PraxisGuard = async ({ client, directory }) => {
  return {
    "tool.execute.after": async (input) => {
      if (input.tool !== "write" && input.tool !== "edit") return;
      const filePath = input.args?.filePath || input.args?.path;
      if (!filePath) return;
      try {
        const abs = filePath.startsWith("/") ? filePath : `${directory}/${filePath}`;
        const { text } = runDetector(abs);
        if (text) {
          await client.app.log({
            body: { service: "praxis-guard", level: "warn", message: text, extra: { file: filePath } },
          });
        }
      } catch { /* warn-only */ }
    },
  };
};
