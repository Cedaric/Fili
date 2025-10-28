import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import MarkdownIt from "markdown-it";
import { minify as minifyJS } from "terser";
import CleanCSS from "clean-css";
import { minify as minifyHTML } from "html-minifier-terser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

class StaticSiteBuilder {
  constructor() {
    this.config = null;
    this.prefaces = [];
    this.chapters = [];
    this.epilogues = [];
    this.templates = {};
    this.enableMinification = true;
    this.stats = {
      css: { original: 0, compressed: 0 },
      js: { original: 0, compressed: 0 },
      html: { original: 0, compressed: 0 },
    };
    this.paths = {
      root: __dirname,
      dist: path.join(__dirname, "dist"),
      templates: path.join(__dirname, "templates"),
      content: path.join(__dirname, "content"),
      static: path.join(__dirname, "static"),
    };

    // 加密配置
    this.ITERATIONS = 333333;
    this.KEY_LENGTH = 256;
    this.SALT_LENGTH = 16;
    this.IV_LENGTH = 12;
  }

  async build() {
    try {
      console.log("[BUILD] Starting build process...\n");

      await this.initialize();
      await this.loadConfig();
      await this.loadTemplates();
      await this.parsePrefaces();
      await this.parseChapters();
      await this.parseEpilogues();
      await this.buildPages();
      await this.minifyAssets();

      console.log("\n[BUILD] Build completed successfully");
      this.showFinalStats();
    } catch (error) {
      console.error("[ERROR] Build failed:", error.message);
      throw error;
    }
  }

  async initialize() {
    await fs.emptyDir(this.paths.dist);
    console.log("[INIT] Cleaned output directory");
  }

  async loadConfig() {
    try {
      const configPath = path.join(this.paths.root, "config.json");
      this.config = await fs.readJson(configPath);
      this.enableMinification = this.config.minification ?? true;
      console.log("[CONFIG] Configuration loaded");
    } catch (error) {
      throw new Error(`Failed to load config: ${error.message}`);
    }
  }

  async loadTemplates() {
    try {
      const templateFiles = ["layout.html", "index.html", "chapter.html"];

      for (const file of templateFiles) {
        const name = file.replace(".html", "");
        const filePath = path.join(this.paths.templates, file);
        this.templates[name] = await fs.readFile(filePath, "utf-8");
      }

      console.log("[TEMPLATE] Templates loaded");
    } catch (error) {
      throw new Error(`Failed to load templates: ${error.message}`);
    }
  }

  async parsePrefaces() {
    if (!this.config.prefaces || this.config.prefaces.length === 0) {
      console.log("[PARSE] No prefaces to parse");
      return;
    }

    console.log("[PARSE] Parsing prefaces...");

    for (const filename of this.config.prefaces) {
      try {
        const filepath = path.join(this.paths.content, filename);
        const content = await fs.readFile(filepath, "utf-8");
        const parsed = this.parseMarkdown(content, filename, "preface");
        this.prefaces.push(parsed);
      } catch (error) {
        console.warn(`[WARN] Skipping preface ${filename}: ${error.message}`);
      }
    }

    console.log(`[PARSE] Parsed ${this.prefaces.length} preface(s)`);
  }

  async parseChapters() {
    console.log("[PARSE] Parsing chapters...");

    for (const filename of this.config.chapters) {
      try {
        const filepath = path.join(this.paths.content, filename);
        const content = await fs.readFile(filepath, "utf-8");
        const parsed = this.parseMarkdown(content, filename, "chapter");
        this.chapters.push(parsed);
      } catch (error) {
        console.warn(`[WARN] Skipping chapter ${filename}: ${error.message}`);
      }
    }

    console.log(`[PARSE] Parsed ${this.chapters.length} chapter(s)`);
  }

  async parseEpilogues() {
    if (!this.config.epilogues || this.config.epilogues.length === 0) {
      console.log("[PARSE] No epilogues to parse");
      return;
    }

    console.log("[PARSE] Parsing epilogues...");

    for (const filename of this.config.epilogues) {
      try {
        const filepath = path.join(this.paths.content, filename);
        const content = await fs.readFile(filepath, "utf-8");
        const parsed = this.parseMarkdown(content, filename, "epilogue");
        this.epilogues.push(parsed);
      } catch (error) {
        console.warn(`[WARN] Skipping epilogue ${filename}: ${error.message}`);
      }
    }

    console.log(`[PARSE] Parsed ${this.epilogues.length} epilogue(s)`);
  }

  parseMarkdown(text, filename, type = "chapter") {
    const metadata = this.extractMetadata(text);
    const contentStartLine = this.findContentStart(text);
    const htmlContent = this.chapterMarkdownContent(text, contentStartLine);

    metadata.id = filename.replace(".md", "");
    metadata.filename = filename;
    metadata.type = type;

    return {
      metadata,
      content: htmlContent,
      filename,
      slug: metadata.id,
      type,
    };
  }

  extractMetadata(text) {
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

      value = this.parseMetadataValue(key, value);
      metadata[key] = value;
    }

    return metadata;
  }

  parseMetadataValue(key, value) {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === "tags" && value.startsWith("[") && value.endsWith("]")) {
      return value
        .slice(1, -1)
        .split(",")
        .map((tag) => tag.trim().replace(/['"]/g, ""));
    }

    return value;
  }

  findContentStart(text) {
    const lines = text.split("\n");

    if (lines[0] !== "---") {
      return 0;
    }

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        return i + 1;
      }
    }

    return 0;
  }

  chapterMarkdownContent(text, startLine) {
    const lines = text.split("\n");
    const markdownContent = lines.slice(startLine).join("\n");
    let htmlContent = md.render(markdownContent);

    htmlContent = this.processImagePaths(htmlContent);

    return htmlContent;
  }

  processImagePaths(html) {
    return html.replace(
      /<img([^>]*?)src="([^"]*?)"([^>]*?)>/g,
      (match, before, src, after) => {
        const normalizedSrc = this.normalizeAssetPath(src);
        return `<img${before}src="${normalizedSrc}"${after}>`;
      },
    );
  }

  normalizeAssetPath(src) {
    if (src.startsWith("http") || src.startsWith("//")) {
      return src;
    }

    if (src.startsWith("/static/")) {
      return src;
    }

    if (src.startsWith("/")) {
      src = src.substring(1);
    }

    if (!src.startsWith("static/")) {
      return `/static/${src}`;
    }

    return `/${src}`;
  }

  // 获取按顺序组合的所有内容（用于导航）
  getAllContentsInOrder() {
    return [
      ...this.prefaces.map((item, index) => ({
        ...item,
        globalIndex: index,
        sectionType: "preface",
      })),
      ...this.chapters.map((item, index) => ({
        ...item,
        globalIndex: this.prefaces.length + index,
        sectionType: "chapter",
      })),
      ...this.epilogues.map((item, index) => ({
        ...item,
        globalIndex: this.prefaces.length + this.chapters.length + index,
        sectionType: "epilogue",
      })),
    ];
  }

  // 获取用于前端的目录数据
  getNavigationData() {
    const allContents = this.getAllContentsInOrder();

    return allContents.map((item) => ({
      title: item.metadata.title,
      subtitle: item.metadata.subtitle,
      category: item.metadata.category,
      slug: item.slug,
      type: item.type,
      sectionType: item.sectionType,
      globalIndex: item.globalIndex,
      isEncrypted: !!item.metadata.password,
    }));
  }

  async buildPages() {
    console.log("[BUILD] Building pages...");

    await this.buildHomePage();

    // 分别构建三类内容
    await this.buildPrefacePages();
    await this.buildChapterPages();
    await this.buildEpiloguePages();

    const totalPages =
      this.prefaces.length + this.chapters.length + this.epilogues.length + 1;
    console.log(`[BUILD] Generated ${totalPages} pages`);
  }

  async buildHomePage() {
    const content = this.chapterTemplate(this.templates.index, {
      title: this.config.siteInfo.title,
      subtitle: this.config.siteInfo.subtitle,
      author: this.config.siteInfo.author,
      description: this.config.siteInfo.description,
    });

    let html = this.applyLayout(content, {
      title: this.config.siteInfo.title,
      description: this.config.siteInfo.description,
      keywords: this.config.siteInfo.keywords,
      currentIndex: -1,
      isHome: true,
    });

    html = await this.minifyHTMLIfEnabled(html);

    const outputPath = path.join(this.paths.dist, "index.html");
    await fs.outputFile(outputPath, html);
    console.log("[BUILD] Built home page");
  }

  async buildPrefacePages() {
    if (this.prefaces.length === 0) return;

    console.log("[BUILD] Building preface pages...");
    for (let i = 0; i < this.prefaces.length; i++) {
      await this.buildContentPage(this.prefaces[i], i, "preface");
    }
  }

  async buildChapterPages() {
    console.log("[BUILD] Building chapter pages...");
    for (let i = 0; i < this.chapters.length; i++) {
      // 章节的全局索引需要加上前言数量
      const globalIndex = this.prefaces.length + i;
      await this.buildContentPage(this.chapters[i], globalIndex, "chapter");
    }
  }

  async buildEpiloguePages() {
    if (this.epilogues.length === 0) return;

    console.log("[BUILD] Building epilogue pages...");
    for (let i = 0; i < this.epilogues.length; i++) {
      // 后记的全局索引需要加上前言和章节数量
      const globalIndex = this.prefaces.length + this.chapters.length + i;
      await this.buildContentPage(this.epilogues[i], globalIndex, "epilogue");
    }
  }

  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const binaryStr = bytes.reduce(
      (acc, byte) => acc + String.fromCharCode(byte),
      "",
    );
    return btoa(binaryStr)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async encryptContent(content, password) {
    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"],
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: this.ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: this.KEY_LENGTH },
      false,
      ["encrypt"],
    );

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      new TextEncoder().encode(content),
    );

    return {
      encrypted: this.bufferToBase64(encrypted),
      iv: this.bufferToBase64(iv),
      salt: this.bufferToBase64(salt),
    };
  }

  generateDecryptionScript() {
    return `
            <script>
                const ITERATIONS = ${this.ITERATIONS};
                const KEY_LENGTH = ${this.KEY_LENGTH};

                function base64ToBuffer(base64) {
                    const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    return bytes.buffer;
                }

                async function decryptContent() {
                    const passwordInput = document.getElementById('password-input');
                    const errorMessage = document.getElementById('error-message');
                    const errorText = document.getElementById('error-text');
                    const encryptedDiv = document.getElementById('encrypted-content');
                    const unlockBtn = document.querySelector('.password-unlock-btn');
                    const passwordBox = document.querySelector('.password-box');

                    const password = passwordInput.value.trim();
                    
                    // 清除之前的错误状态
                    errorMessage.classList.remove('show');
                    passwordInput.classList.remove('error');
                    
                    if (!password) {
                        errorText.textContent = '请输入密码';
                        errorMessage.classList.add('show');
                        passwordInput.classList.add('error');
                        passwordInput.focus();
                        
                        // 3秒后自动隐藏错误提示
                        setTimeout(() => {
                            errorMessage.classList.remove('show');
                            passwordInput.classList.remove('error');
                        }, 3000);
                        return;
                    }

                    // 设置加载状态
                    unlockBtn.disabled = true;
                    unlockBtn.classList.add('loading');
                    
                    // 根据屏幕宽度显示不同的加载文本
                    if (window.innerWidth > 480) {
                        unlockBtn.innerHTML = '<span class="btn-text">解密中</span><i class="ri-loader-4-line"></i>';
                    } else {
                        unlockBtn.innerHTML = '<i class="ri-loader-4-line"></i>';
                    }

                    try {
                        const encryptedData = encryptedDiv.dataset.encrypted;
                        const iv = base64ToBuffer(encryptedDiv.dataset.iv);
                        const salt = base64ToBuffer(encryptedDiv.dataset.salt);

                        const keyMaterial = await crypto.subtle.importKey(
                            'raw',
                            new TextEncoder().encode(password),
                            'PBKDF2',
                            false,
                            ['deriveBits', 'deriveKey']
                        );

                        const key = await crypto.subtle.deriveKey(
                            {
                                name: 'PBKDF2',
                                salt,
                                iterations: ITERATIONS,
                                hash: 'SHA-256'
                            },
                            keyMaterial,
                            { name: 'AES-GCM', length: KEY_LENGTH },
                            false,
                            ['decrypt']
                        );

                        const decrypted = await crypto.subtle.decrypt(
                            {
                                name: 'AES-GCM',
                                iv
                            },
                            key,
                            base64ToBuffer(encryptedData)
                        );

                        const decryptedText = new TextDecoder().decode(decrypted);
                        
                        // 淡出密码框
                        passwordBox.style.opacity = '0';
                        passwordBox.style.transform = 'scale(0.95)';
                        
                        setTimeout(() => {
                            const contentBody = document.querySelector('.content-body');
                            if (contentBody) {
                                contentBody.innerHTML = decryptedText;
                                contentBody.style.opacity = '0';
                                setTimeout(() => {
                                    contentBody.style.transition = 'opacity 0.6s ease';
                                    contentBody.style.opacity = '1';
                                }, 50);
                            }
                            
                            // 保存解锁状态
                            sessionStorage.setItem('content-unlocked-' + window.location.pathname, 'true');
                            sessionStorage.setItem('content-password-' + window.location.pathname, password);
                        }, 400);

                    } catch (error) {
                        console.error('Decryption failed:', error);
                        
                        // 显示错误提示
                        errorText.textContent = '密码错误，请重试';
                        errorMessage.classList.add('show');
                        
                        // 添加错误状态
                        passwordInput.classList.add('error');
                        passwordBox.classList.add('shake');
                        
                        // 清空密码并聚焦
                        passwordInput.value = '';
                        passwordInput.focus();
                        
                        // 移除抖动动画
                        setTimeout(() => {
                            passwordBox.classList.remove('shake');
                        }, 500);
                        
                        // 4秒后自动隐藏错误提示
                        setTimeout(() => {
                            errorMessage.classList.remove('show');
                            passwordInput.classList.remove('error');
                        }, 4000);
                        
                        // 恢复按钮状态
                        unlockBtn.disabled = false;
                        unlockBtn.classList.remove('loading');
                        
                        // 根据屏幕宽度恢复按钮内容
                        if (window.innerWidth > 480) {
                            unlockBtn.innerHTML = '<span class="btn-text">解密</span><i class="ri-arrow-right-line"></i>';
                        } else {
                            unlockBtn.innerHTML = '<i class="ri-arrow-right-line"></i>';
                        }
                    }
                }

                document.addEventListener('DOMContentLoaded', function() {
                    const passwordInput = document.getElementById('password-input');
                    if (passwordInput) {
                        // 回车键解密
                        passwordInput.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') {
                                decryptContent();
                            }
                        });

                        // 输入时清除错误状态
                        passwordInput.addEventListener('input', function() {
                            const errorMessage = document.getElementById('error-message');
                            errorMessage.classList.remove('show');
                            passwordInput.classList.remove('error');
                        });

                        // 检查是否已解锁
                        const savedPassword = sessionStorage.getItem('content-password-' + window.location.pathname);
                        const isUnlocked = sessionStorage.getItem('content-unlocked-' + window.location.pathname);
                        
                        if (isUnlocked === 'true' && savedPassword) {
                            passwordInput.value = savedPassword;
                            decryptContent();
                        } else {
                            passwordInput.focus();
                        }
                    }
                    
                    // 监听窗口大小变化，更新按钮显示
                    window.addEventListener('resize', function() {
                        const unlockBtn = document.querySelector('.password-unlock-btn');
                        if (unlockBtn && !unlockBtn.classList.contains('loading')) {
                            if (window.innerWidth > 480) {
                                unlockBtn.innerHTML = '<span class="btn-text">解密</span><i class="ri-arrow-right-line"></i>';
                            } else {
                                unlockBtn.innerHTML = '<i class="ri-arrow-right-line"></i>';
                            }
                        }
                    });
                });
            </script>
        `;
  }

  async buildContentPage(content, globalIndex, sectionType) {
    const { metadata, content: htmlContent, slug, type } = content;

    const watermarkStyle = this.buildWatermarkStyle(metadata.illustration);
    const tagsHtml = this.buildTagsHtml(metadata.tags || []);
    const subtitleHtml = metadata.subtitle
      ? `<p class="content-subtitle">${this.escapeHtml(metadata.subtitle)}</p>`
      : "";
    const categoryHtml = metadata.category
      ? `<span class="content-category">${this.escapeHtml(metadata.category)}</span>`
      : "";

    let decryptionScript = "";
    let contentBodyHtml = htmlContent;
    let encryptedDataDiv = "";

    // 如果配置了密码，进行加密
    if (metadata.password) {
      console.log(`[ENCRYPT] Encrypting content for: ${metadata.title}`);
      const encrypted = await this.encryptContent(
        htmlContent,
        metadata.password,
      );

      encryptedDataDiv = `
            <div id="encrypted-content" 
                 data-encrypted="${encrypted.encrypted}" 
                 data-iv="${encrypted.iv}" 
                 data-salt="${encrypted.salt}"
                 style="display: none;">
            </div>
        `;

      decryptionScript = this.generateDecryptionScript();

      contentBodyHtml = `
                <div class="password-box">
                    <div class="password-header">
                        <h2 class="password-title">
                            <i class="ri-shield-keyhole-line"></i>
                            这是受保护的加密内容
                        </h2>
                    </div>
                    
                    <div class="password-input-wrapper">
                        <i class="ri-key-2-line password-input-icon"></i>
                        <input 
                            type="password" 
                            id="password-input" 
                            class="password-input"
                            placeholder="请输入密码" 
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <button class="password-unlock-btn" onclick="decryptContent()">
                            <span class="btn-text">解密</span>
                            <i class="ri-arrow-right-line"></i>
                        </button>
                    </div>
                    
                    <div id="error-message" class="error-message">
                        <i class="ri-error-warning-line"></i>
                        <span id="error-text"></span>
                    </div>
                </div>
            `;
    }

    // 构建页面内容
    const pageContent = this.templates.chapter
      .replace("{{title}}", this.escapeHtml(metadata.title || "未知标题"))
      .replace("{{subtitle}}", subtitleHtml)
      .replace("{{category}}", categoryHtml)
      .replace("{{watermarkStyle}}", watermarkStyle)
      .replace("{{content}}", contentBodyHtml)
      .replace("{{tags}}", tagsHtml);

    // 添加加密数据容器
    const pageContentWithEncryption = pageContent + encryptedDataDiv;

    let html = this.applyLayout(pageContentWithEncryption, {
      title: `${metadata.title} - ${this.config.siteInfo.title}`,
      description:
        metadata.subtitle || this.extractTextFromHtml(htmlContent, 150),
      keywords: this.config.siteInfo.keywords,
      currentIndex: globalIndex,
      sectionType: sectionType,
    });

    // 在 </body> 标签前插入解密脚本
    if (decryptionScript) {
      html = html.replace("</body>", decryptionScript + "\n</body>");
    }

    html = await this.minifyHTMLIfEnabled(html);

    const outputPath = path.join(
      this.paths.dist,
      "chapter",
      slug,
      "index.html",
    );
    await fs.outputFile(outputPath, html);
  }

  getTypeLabel(type) {
    const labels = {
      preface: "前言",
      chapter: "",
      epilogue: "后记",
    };
    return labels[type] || "";
  }

  buildWatermarkStyle(illustration) {
    if (!illustration) {
      return "";
    }
    return `style="--watermark-image: url('${illustration}')"`;
  }

  buildTagsHtml(tags) {
    if (!tags || tags.length === 0) {
      return "";
    }

    return `
            <div class="content-tags">
                ${tags
                  .map(
                    (tag) => `
                    <span class="content-tag">
                        <i class="ri-bookmark-fill"></i>${this.escapeHtml(tag)}
                    </span>
                `,
                  )
                  .join("")}
            </div>
        `;
  }

  chapterTemplate(template, data) {
    return template
      .replace("{{title}}", this.escapeHtml(data.title || ""))
      .replace("{{subtitle}}", this.escapeHtml(data.subtitle || ""))
      .replace("{{author}}", this.escapeHtml(data.author || ""))
      .replace("{{description}}", this.escapeHtml(data.description || ""));
  }

  applyLayout(content, options) {
    const chaptersData = JSON.stringify(this.getNavigationData());
    const siteInfo = JSON.stringify(this.config.siteInfo);

    return this.templates.layout
      .replace("{{title}}", this.escapeHtml(options.title))
      .replace("{{description}}", this.escapeHtml(options.description))
      .replace("{{keywords}}", this.escapeHtml(options.keywords))
      .replace("{{content}}", content)
      .replace("{{ chaptersData }}", chaptersData)
      .replace("{{ currentIndex }}", options.currentIndex.toString())
      .replace("{{ siteInfo }}", siteInfo)
      .replace("{{ isHome }}", (options.isHome || false).toString());
  }

  extractTextFromHtml(html, maxLength = 150) {
    const text = html.replace(/<[^>]*>/g, "").trim();
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  escapeHtml(text) {
    if (!text) return "";
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  async minifyAssets() {
    console.log("\n[ASSETS] Processing assets...");

    await this.minifyCSS();
    await this.minifyJavaScript();
  }

  async minifyCSS() {
    try {
      const cssPath = path.join(this.paths.root, "styles.css");
      const cssExists = await fs.pathExists(cssPath);

      if (!cssExists) {
        console.log("[CSS] No styles.css found, skipping...");
        return;
      }

      const css = await fs.readFile(cssPath, "utf-8");
      this.stats.css.original = css.length;

      let output = css;
      if (this.enableMinification) {
        const result = new CleanCSS({
          level: 2,
          compatibility: "ie9",
        }).minify(css);

        if (result.errors.length > 0) {
          console.warn("[WARN] CSS minification errors:", result.errors);
        }

        output = result.styles;
      }

      this.stats.css.compressed = output.length;

      const outputPath = path.join(this.paths.dist, "styles.css");
      await fs.outputFile(outputPath, output);

      const saved = ((1 - output.length / css.length) * 100).toFixed(1);
      console.log(
        `[CSS] Processed: ${this.formatBytes(css.length)} → ${this.formatBytes(output.length)} (${saved}% saved)`,
      );
    } catch (error) {
      console.warn("[WARN] Failed to process CSS:", error.message);
    }
  }

  async minifyJavaScript() {
    try {
      const jsPath = path.join(this.paths.root, "script.js");
      const jsExists = await fs.pathExists(jsPath);

      if (!jsExists) {
        console.log("[JS] No script.js found, skipping...");
        return;
      }

      const js = await fs.readFile(jsPath, "utf-8");
      this.stats.js.original = js.length;

      let output = js;
      if (this.enableMinification) {
        const result = await minifyJS(js, {
          compress: {
            dead_code: true,
            drop_console: false,
            drop_debugger: true,
            keep_classnames: false,
            keep_fargs: true,
            keep_fnames: false,
            keep_infinity: false,
          },
          mangle: {
            toplevel: false,
            keep_classnames: false,
            keep_fnames: false,
          },
          format: {
            comments: false,
          },
        });

        if (result.error) {
          console.warn("[WARN] JS minification error:", result.error);
          output = js;
        } else {
          output = result.code;
        }
      }

      this.stats.js.compressed = output.length;

      const outputPath = path.join(this.paths.dist, "script.js");
      await fs.outputFile(outputPath, output);

      const saved = ((1 - output.length / js.length) * 100).toFixed(1);
      console.log(
        `[JS] Processed: ${this.formatBytes(js.length)} → ${this.formatBytes(output.length)} (${saved}% saved)`,
      );
    } catch (error) {
      console.warn("[WARN] Failed to process JavaScript:", error.message);
    }
  }

  async minifyHTMLIfEnabled(html) {
    if (!this.enableMinification) {
      return html;
    }

    try {
      const originalSize = html.length;
      const minified = await minifyHTML(html, {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        useShortDoctype: true,
        minifyCSS: true,
        minifyJS: true,
      });

      this.stats.html.original += originalSize;
      this.stats.html.compressed += minified.length;

      return minified;
    } catch (error) {
      console.warn("[WARN] HTML minification failed:", error.message);
      return html;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  showFinalStats() {
    console.log("\n[STATS] Build Statistics:");
    console.log("─────────────────────────────────────");

    if (this.stats.css.original > 0) {
      const cssSaved = (
        (1 - this.stats.css.compressed / this.stats.css.original) *
        100
      ).toFixed(1);
      console.log(
        `CSS:  ${this.formatBytes(this.stats.css.original)} → ${this.formatBytes(this.stats.css.compressed)} (${cssSaved}% saved)`,
      );
    }

    if (this.stats.js.original > 0) {
      const jsSaved = (
        (1 - this.stats.js.compressed / this.stats.js.original) *
        100
      ).toFixed(1);
      console.log(
        `JS:   ${this.formatBytes(this.stats.js.original)} → ${this.formatBytes(this.stats.js.compressed)} (${jsSaved}% saved)`,
      );
    }

    if (this.stats.html.original > 0) {
      const htmlSaved = (
        (1 - this.stats.html.compressed / this.stats.html.original) *
        100
      ).toFixed(1);
      console.log(
        `HTML: ${this.formatBytes(this.stats.html.original)} → ${this.formatBytes(this.stats.html.compressed)} (${htmlSaved}% saved)`,
      );
    }

    console.log("─────────────────────────────────────");
  }
}

// 运行构建
const builder = new StaticSiteBuilder();
builder.build().catch((error) => {
  console.error("Build process failed:", error);
  process.exit(1);
});
