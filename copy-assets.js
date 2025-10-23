import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AssetsCopier {
  constructor(config = {}) {
    this.paths = {
      root: __dirname,
      dist: path.join(__dirname, "dist"),
    };

    // 默认配置
    this.config = {
      directories: config.directories || ["static", "page"],
      files: config.files || ["favicon.png"],
      // 可选：是否清理目标目录
      clean: config.clean || false,
      // 可选：排除的文件/目录模式
      exclude: config.exclude || [],
    };

    this.stats = {
      directories: {
        count: 0,
        files: 0,
        size: 0,
        details: [],
      },
      files: {
        count: 0,
        size: 0,
        details: [],
      },
    };
  }

  async copy() {
    try {
      console.log("[ASSETS] Starting assets copy process...\n");

      // 可选：清理目标目录
      if (this.config.clean) {
        await this.cleanDist();
      }

      // 复制目录
      if (this.config.directories.length > 0) {
        console.log("[DIRECTORIES] Copying directories...");
        for (const dir of this.config.directories) {
          await this.copyDirectory(dir);
        }
        console.log("");
      }

      // 复制文件
      if (this.config.files.length > 0) {
        console.log("[FILES] Copying files...");
        for (const file of this.config.files) {
          await this.copyFile(file);
        }
        console.log("");
      }

      this.showStats();
      console.log("\n[ASSETS] All assets copied successfully");
    } catch (error) {
      console.error("[ERROR] Copy process failed:", error.message);
      throw error;
    }
  }

  async cleanDist() {
    try {
      const distExists = await fs.pathExists(this.paths.dist);
      if (distExists) {
        await fs.emptyDir(this.paths.dist);
        console.log("[CLEAN] Cleaned dist directory\n");
      }
    } catch (error) {
      console.warn("[WARN] Failed to clean dist directory:", error.message);
    }
  }

  async copyDirectory(dirName) {
    const sourcePath = path.join(this.paths.root, dirName);
    const destPath = path.join(this.paths.dist, dirName);

    try {
      // 检查源目录是否存在
      const sourceExists = await fs.pathExists(sourcePath);
      if (!sourceExists) {
        console.log(`  ⊘ ${dirName}/ (not found, skipping)`);
        return;
      }

      // 确保目标目录存在
      await fs.ensureDir(destPath);

      // 复制目录（支持排除规则）
      await fs.copy(sourcePath, destPath, {
        overwrite: true,
        errorOnExist: false,
        filter: (src) => this.shouldInclude(src),
      });

      // 统计信息
      const dirStats = await this.getDirectoryStats(destPath);

      this.stats.directories.count++;
      this.stats.directories.files += dirStats.files;
      this.stats.directories.size += dirStats.size;
      this.stats.directories.details.push({
        name: dirName,
        files: dirStats.files,
        size: dirStats.size,
      });

      console.log(
        `  ✓ ${dirName}/ → dist/${dirName}/ (${dirStats.files} files, ${this.formatBytes(
          dirStats.size
        )})`
      );
    } catch (error) {
      console.error(`  ✗ ${dirName}/ (error: ${error.message})`);
    }
  }

  async copyFile(fileName) {
    const sourcePath = path.join(this.paths.root, fileName);
    const destPath = path.join(this.paths.dist, fileName);

    try {
      // 检查源文件是否存在
      const sourceExists = await fs.pathExists(sourcePath);
      if (!sourceExists) {
        console.log(`  ⊘ ${fileName} (not found, skipping)`);
        return;
      }

      // 确保目标目录存在
      await fs.ensureDir(path.dirname(destPath));

      // 复制文件
      await fs.copy(sourcePath, destPath, {
        overwrite: true,
      });

      // 获取文件大小
      const stat = await fs.stat(destPath);

      this.stats.files.count++;
      this.stats.files.size += stat.size;
      this.stats.files.details.push({
        name: fileName,
        size: stat.size,
      });

      console.log(`  ✓ ${fileName} → dist/${fileName} (${this.formatBytes(stat.size)})`);
    } catch (error) {
      console.error(`  ✗ ${fileName} (error: ${error.message})`);
    }
  }

  shouldInclude(src) {
    // 检查是否应该排除该文件/目录
    const relativePath = path.relative(this.paths.root, src);

    for (const pattern of this.config.exclude) {
      if (relativePath.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  async getDirectoryStats(dirPath) {
    let fileCount = 0;
    let totalSize = 0;

    async function traverse(currentPath) {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          await traverse(itemPath);
        } else {
          fileCount++;
          totalSize += stat.size;
        }
      }
    }

    try {
      await traverse(dirPath);
    } catch (error) {
      console.warn("[WARN] Failed to get directory stats:", error.message);
    }

    return { files: fileCount, size: totalSize };
  }

  showStats() {
    const hasDirectories = this.stats.directories.count > 0;
    const hasFiles = this.stats.files.count > 0;

    if (!hasDirectories && !hasFiles) {
      console.log("[STATS] No assets were copied");
      return;
    }

    console.log("[STATS] Copy Statistics:");
    console.log("═════════════════════════════════════════════════");

    if (hasDirectories) {
      console.log("\n  Directories:");
      console.log("  ─────────────────────────────────────────────");
      for (const detail of this.stats.directories.details) {
        console.log(
          `    ${detail.name.padEnd(25)} ${detail.files
            .toString()
            .padStart(4)} files  ${this.formatBytes(detail.size).padStart(10)}`
        );
      }
      console.log("  ─────────────────────────────────────────────");
      console.log(
        `    Subtotal:${" ".repeat(16)} ${this.stats.directories.files
          .toString()
          .padStart(4)} files  ${this.formatBytes(this.stats.directories.size).padStart(10)}`
      );
    }

    if (hasFiles) {
      console.log("\n  Individual Files:");
      console.log("  ─────────────────────────────────────────────");
      for (const detail of this.stats.files.details) {
        console.log(
          `    ${detail.name.padEnd(35)} ${this.formatBytes(detail.size).padStart(10)}`
        );
      }
      console.log("  ─────────────────────────────────────────────");
      console.log(
        `    Subtotal:${" ".repeat(26)} ${this.formatBytes(
          this.stats.files.size
        ).padStart(10)}`
      );
    }

    const totalFiles = this.stats.directories.files + this.stats.files.count;
    const totalSize = this.stats.directories.size + this.stats.files.size;

    console.log("\n═════════════════════════════════════════════════");
    console.log(
      `  TOTAL:${" ".repeat(20)} ${totalFiles
        .toString()
        .padStart(4)} items  ${this.formatBytes(totalSize).padStart(10)}`
    );
    console.log("═════════════════════════════════════════════════");
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

// 配置文件加载
async function loadConfig() {
  const configPath = path.join(__dirname, "copy-config.json");

  try {
    const configExists = await fs.pathExists(configPath);

    if (configExists) {
      console.log("[CONFIG] Loading configuration from copy-config.json\n");
      return await fs.readJson(configPath);
    }
  } catch (error) {
    console.warn("[WARN] Failed to load config file, using defaults\n");
  }

  // 默认配置
  return {
    directories: ["page"],
    files: ["favicon.png"],
    clean: false,
    exclude: [".DS_Store", "Thumbs.db", ".git"],
  };
}

// 运行复制
(async () => {
  try {
    const config = await loadConfig();
    const copier = new AssetsCopier(config);
    await copier.copy();
  } catch (error) {
    console.error("Copy process failed:", error);
    process.exit(1);
  }
})();
