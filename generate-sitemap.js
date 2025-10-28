import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AdvancedSitemapGenerator {
  constructor() {
    this.config = null;
    this.chapters = [];
    this.pages = [];
    this.baseUrl = "";

    // XML 命名空间常量
    this.XML_NAMESPACES = {
      SITEMAP: "http://www.sitemaps.org/schemas/sitemap/0.9",
      IMAGE: "http://www.google.com/schemas/sitemap-image/1.1",
    };

    // 默认配置
    this.options = {
      defaultChangefreq: "weekly",
      defaultPriority: "0.8",
      homePagePriority: "1.0",
      homePageChangefreq: "monthly",
      pagesPriority: "0.7",
      pagesChangefreq: "monthly",
      includeImages: true,
      compress: false,
      maxUrlsPerSitemap: 50000,
    };

    // 路径配置
    this.paths = {
      root: __dirname,
      dist: path.join(__dirname, "dist"),
      content: path.join(__dirname, "content"),
      config: path.join(__dirname, "config.json"),
    };
  }

  async generate() {
    try {
      console.log("[SITEMAP] Starting sitemap generation...\n");

      await this.loadConfig();
      await this.parseChapters();
      await this.parsePages();
      await this.generateSitemapXML();
      await this.generateSitemapIndex();
      await this.generateRobotsTxt();

      this.printSummary();
      console.log("\n[SITEMAP] Sitemap generation completed successfully");
    } catch (error) {
      console.error("[ERROR] Sitemap generation failed:", error.message);
      throw error;
    }
  }

  async loadConfig() {
    try {
      this.config = await fs.readJson(this.paths.config);

      // 合并自定义配置
      if (this.config.sitemap) {
        this.options = { ...this.options, ...this.config.sitemap };
      }

      // 获取并验证 baseUrl
      this.baseUrl = this.resolveBaseUrl();

      if (!this.baseUrl) {
        throw new Error(
          'Base URL is not configured. Please set "url" or "siteInfo.url" in config.json',
        );
      }

      console.log("[CONFIG] Configuration loaded");
      console.log(`[CONFIG] Base URL: ${this.baseUrl}`);
    } catch (error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  resolveBaseUrl() {
    const url =
      this.config.siteInfo?.url ||
      this.config.siteInfo?.baseUrl ||
      this.config.url;

    if (!url) {
      return "";
    }

    // 移除末尾的斜杠
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }

  async parsePages() {
    if (!this.config.pages || !Array.isArray(this.config.pages)) {
      console.log("[PAGES] No pages configuration found");
      return;
    }

    this.pages = this.config.pages.map((pageConfig) => ({
      name: pageConfig.name,
      title: pageConfig.title,
      priority: pageConfig.priority || this.options.pagesPriority,
      changefreq: pageConfig.changefreq || this.options.pagesChangefreq,
    }));

    console.log(`[PAGES] Parsed ${this.pages.length} pages`);
  }

  async parseChapters() {
    console.log("[CHAPTERS] Parsing chapters...");

    const allChapters = [];

    // 解析前言
    if (this.config.prefaces && Array.isArray(this.config.prefaces)) {
      for (const filename of this.config.prefaces) {
        const parsed = await this.parseChapterFile(filename, "preface");
        if (parsed) allChapters.push(parsed);
      }
    }

    // 解析章节
    if (this.config.chapters && Array.isArray(this.config.chapters)) {
      for (const filename of this.config.chapters) {
        const parsed = await this.parseChapterFile(filename, "chapter");
        if (parsed) allChapters.push(parsed);
      }
    }

    // 解析后记
    if (this.config.epilogues && Array.isArray(this.config.epilogues)) {
      for (const filename of this.config.epilogues) {
        const parsed = await this.parseChapterFile(filename, "epilogue");
        if (parsed) allChapters.push(parsed);
      }
    }

    // 兼容旧版配置
    if (this.config.renderOrder && Array.isArray(this.config.renderOrder)) {
      for (const filename of this.config.renderOrder) {
        const parsed = await this.parseChapterFile(filename, "chapter");
        if (parsed) allChapters.push(parsed);
      }
    }

    this.chapters = allChapters;
    console.log(`[CHAPTERS] Parsed ${this.chapters.length} chapters`);
  }

  async parseChapterFile(filename, type = "chapter") {
    try {
      const filepath = path.join(this.paths.content, filename);

      if (!(await fs.pathExists(filepath))) {
        console.warn(`[WARN] Chapter file not found: ${filename}`);
        return null;
      }

      const content = await fs.readFile(filepath, "utf-8");
      const parsed = await this.parseMarkdownMetadata(content, filename);
      parsed.type = type;
      return parsed;
    } catch (error) {
      console.warn(
        `[WARN] Failed to parse chapter ${filename}: ${error.message}`,
      );
      return null;
    }
  }

  async parseMarkdownMetadata(text, filename) {
    const metadata = this.extractFrontmatter(text);
    metadata.id = filename.replace(".md", "");
    metadata.filename = filename;

    const images = this.options.includeImages
      ? this.extractImages(text, metadata)
      : [];

    return {
      metadata,
      slug: metadata.id,
      images,
      priority: metadata.priority || this.options.defaultPriority,
      changefreq: metadata.changefreq || this.options.defaultChangefreq,
    };
  }

  extractFrontmatter(text) {
    const lines = text.split("\n");
    const metadata = {};

    if (lines[0] !== "---") {
      return metadata;
    }

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        break;
      }

      const line = lines[i].trim();
      if (!line) continue;

      const colonIndex = line.indexOf(":");
      if (colonIndex <= 0) continue;

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      metadata[key] = value;
    }

    return metadata;
  }

  extractImages(text, metadata) {
    const images = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = imageRegex.exec(text)) !== null) {
      const [, alt, src] = match;

      // 跳过外部图片
      if (src.startsWith("http")) {
        continue;
      }

      const imageSrc = this.normalizeImageUrl(src);

      images.push({
        loc: imageSrc,
        caption: alt || metadata.title || "",
        title: alt || metadata.title || "",
      });
    }

    return images;
  }

  normalizeImageUrl(src) {
    // 已经是完整路径
    if (src.startsWith("/")) {
      return `${this.baseUrl}${src}`;
    }

    // static/ 开头
    if (src.startsWith("static/")) {
      return `${this.baseUrl}/${src}`;
    }

    // 其他情况，添加 /static/ 前缀
    return `${this.baseUrl}/static/${src}`;
  }

  async generateSitemapXML() {
    console.log("[SITEMAP] Generating sitemap.xml...");

    const urls = this.collectAllUrls();
    const xmlContent = this.buildXMLContent(urls);

    const outputPath = path.join(this.paths.dist, "sitemap.xml");
    await fs.ensureDir(this.paths.dist);
    await fs.outputFile(outputPath, xmlContent);

    console.log(`[SITEMAP] Generated sitemap.xml with ${urls.length} URLs`);
  }

  collectAllUrls() {
    const urls = [];

    // 首页
    urls.push({
      loc: this.baseUrl,
      changefreq: this.options.homePageChangefreq,
      priority: this.options.homePagePriority,
      images: [],
    });

    // 章节页面
    this.chapters.forEach((chapter) => {
      urls.push({
        loc: `${this.baseUrl}/chapter/${chapter.slug}/`,
        changefreq: chapter.changefreq,
        priority: chapter.priority,
        images: chapter.images || [],
      });
    });

    // 其他页面
    this.pages.forEach((page) => {
      urls.push({
        loc: `${this.baseUrl}/${page.name}`,
        changefreq: page.changefreq,
        priority: page.priority,
        images: [],
      });
    });

    return urls;
  }

  buildXMLContent(urls) {
    const parts = [];

    // XML 声明
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');

    // urlset 开始标签
    let urlsetTag = `<urlset xmlns="${this.XML_NAMESPACES.SITEMAP}"`;
    if (this.options.includeImages) {
      urlsetTag += ` xmlns:image="${this.XML_NAMESPACES.IMAGE}"`;
    }
    urlsetTag += ">";
    parts.push(urlsetTag);

    // URL 条目
    urls.forEach((url) => {
      parts.push(this.buildUrlEntry(url));
    });

    // urlset 结束标签
    parts.push("</urlset>");

    return parts.join("\n");
  }

  buildUrlEntry(url) {
    const parts = [];

    parts.push("  <url>");
    parts.push(`    <loc>${this.escapeXml(url.loc)}</loc>`);
    parts.push(`    <changefreq>${url.changefreq}</changefreq>`);
    parts.push(`    <priority>${url.priority}</priority>`);

    // 添加图片信息
    if (this.options.includeImages && url.images && url.images.length > 0) {
      url.images.forEach((image) => {
        parts.push(this.buildImageEntry(image));
      });
    }

    parts.push("  </url>");

    return parts.join("\n");
  }

  buildImageEntry(image) {
    const parts = [];

    parts.push("    <image:image>");
    parts.push(`      <image:loc>${this.escapeXml(image.loc)}</image:loc>`);

    if (image.caption) {
      parts.push(
        `      <image:caption>${this.escapeXml(image.caption)}</image:caption>`,
      );
    }

    if (image.title) {
      parts.push(
        `      <image:title>${this.escapeXml(image.title)}</image:title>`,
      );
    }

    parts.push("    </image:image>");

    return parts.join("\n");
  }

  async generateSitemapIndex() {
    const totalUrls = this.getTotalUrlCount();

    // 只有在 URL 数量超过阈值时才生成索引文件
    if (totalUrls <= this.options.maxUrlsPerSitemap) {
      console.log("[SITEMAP] Skipping sitemap index (URLs below threshold)");
      return;
    }

    console.log("[SITEMAP] Generating sitemap-index.xml...");

    const indexContent = this.buildSitemapIndexContent();
    const outputPath = path.join(this.paths.dist, "sitemap-index.xml");
    await fs.outputFile(outputPath, indexContent);

    console.log("[SITEMAP] Generated sitemap-index.xml");
  }

  buildSitemapIndexContent() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="${this.XML_NAMESPACES.SITEMAP}">
  <sitemap>
    <loc>${this.baseUrl}/sitemap.xml</loc>
  </sitemap>
</sitemapindex>`;
  }

  async generateRobotsTxt() {
    console.log("[SITEMAP] Generating robots.txt...");

    const robotsContent = this.buildRobotsContent();
    const outputPath = path.join(this.paths.dist, "robots.txt");
    await fs.outputFile(outputPath, robotsContent);

    console.log("[SITEMAP] Generated robots.txt");
  }

  buildRobotsContent() {
    const totalUrls = this.getTotalUrlCount();
    const lines = [];

    lines.push("User-agent: *");
    lines.push("Allow: /");
    lines.push("Disallow: *.mp3");
    lines.push("");

    // 根据 URL 数量决定引用哪个 sitemap
    if (totalUrls > this.options.maxUrlsPerSitemap) {
      lines.push(`Sitemap: ${this.baseUrl}/sitemap-index.xml`);
    }
    lines.push(`Sitemap: ${this.baseUrl}/sitemap.xml`);

    return lines.join("\n");
  }

  getTotalUrlCount() {
    return this.pages.length + this.chapters.length + 1; // +1 for homepage
  }

  escapeXml(text) {
    if (!text) return "";

    const xmlEscapeMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };

    return String(text).replace(/[&<>"']/g, (char) => xmlEscapeMap[char]);
  }

  printSummary() {
    console.log("\n[SUMMARY] Sitemap Statistics:");
    console.log("=".repeat(60));
    console.log(`  Total URLs: ${this.getTotalUrlCount()}`);
    console.log(`  - Homepage: 1`);
    console.log(`  - Chapters: ${this.chapters.length}`);
    console.log(`  - Pages: ${this.pages.length}`);

    if (this.options.includeImages) {
      const totalImages = this.chapters.reduce(
        (sum, ch) => sum + (ch.images?.length || 0),
        0,
      );
      console.log(`  Total Images: ${totalImages}`);
    }

    console.log("=".repeat(60));
  }
}

// Execute generation
const generator = new AdvancedSitemapGenerator();
generator.generate().catch((error) => {
  console.error("[FATAL] Sitemap generation terminated with error");
  process.exit(1);
});
