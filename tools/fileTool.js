import { promises as fs } from "fs";
import path from "path";

class FileTool {
  constructor(baseDir = process.cwd()) {
    this.baseDir = baseDir;
  }

  resolveSafePath(filePath) {
    const resolved = path.resolve(this.baseDir, filePath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error("Access denied: Path outside of sandbox");
    }
    return resolved;
  }

  async read(filePath) {
    const absPath = this.resolveSafePath(filePath);
    return await fs.readFile(absPath, "utf-8");
  }

  async write(filePath, contents) {
    const absPath = this.resolveSafePath(filePath);
    console.log("[FileTool] Writing to:", absPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, contents, "utf-8");
    return "Write successful";
  }

  async list(dirPath = ".") {
    const absDir = this.resolveSafePath(dirPath);
    return await fs.readdir(absDir);
  }
}

export default FileTool;
