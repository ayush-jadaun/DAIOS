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
  async append(filePath, contents) {
    const absPath = this.resolveSafePath(filePath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.appendFile(absPath, contents, "utf-8");
    return "Append successful";
  }

  async delete(filePath) {
    const absPath = this.resolveSafePath(filePath);
    await fs.unlink(absPath);
    return "Delete successful";
  }

  async move(srcPath, destPath) {
    const absSrc = this.resolveSafePath(srcPath);
    const absDest = this.resolveSafePath(destPath);
    await fs.mkdir(path.dirname(absDest), { recursive: true });
    await fs.rename(absSrc, absDest);
    return "Move successful";
  }

  async copy(srcPath, destPath) {
    const absSrc = this.resolveSafePath(srcPath);
    const absDest = this.resolveSafePath(destPath);
    await fs.mkdir(path.dirname(absDest), { recursive: true });
    await fs.copyFile(absSrc, absDest);
    return "Copy successful";
  }
}

export default FileTool;
