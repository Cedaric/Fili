import fs from "fs-extra";
import path from "path";
import MarkdownIt from "markdown-it";
import { minify as minifyHTML } from "html-minifier-terser";

class SimpleBuilder {
  constructor() {
    this.config = null;
    this.outputDir = "dist";
    this.templateFile = "templates/page.html";
    this.md = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true,
    });
    this.templateCache = null;

    // 加密配置
    this.ITERATIONS = 333333;
    this.KEY_LENGTH = 256;
    this.SALT_LENGTH = 16;
    this.IV_LENGTH = 12;

    // 模板变量映射
    this.TEMPLATE_VARS = {
      TITLE: "TITLE",
      PAGE_TITLE: "PAGE_TITLE",
      MUSIC_PLAYER: "MUSIC_PLAYER",
      MARKDOWN_CONTENT: "MARKDOWN_CONTENT",
      BACK_TO_TOP_BUTTON: "BACK_TO_TOP_BUTTON",
      BACK_TO_TOP_SCRIPT: "BACK_TO_TOP_SCRIPT",
      ENCRYPTION_DATA: "ENCRYPTION_DATA",
      DECRYPTION_SCRIPT: "DECRYPTION_SCRIPT",
    };
  }

  async loadConfig() {
    try {
      const configData = await fs.readFile("config.json", "utf8");
      this.config = JSON.parse(configData);
      console.log("[CONFIG] Configuration loaded successfully");
    } catch (error) {
      throw new Error(`Failed to load config.json: ${error.message}`);
    }
  }

  async loadTemplate() {
    if (this.templateCache) {
      return this.templateCache;
    }

    try {
      this.templateCache = await fs.readFile(this.templateFile, "utf8");
      return this.templateCache;
    } catch (error) {
      throw new Error(
        `Failed to load template ${this.templateFile}: ${error.message}`,
      );
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

  async build() {
    console.log("[BUILD] Starting build process...\n");

    try {
      await this.loadConfig();
      await this.ensureOutputDirectory();

      for (const pageConfig of this.config.pages) {
        await this.buildPage(pageConfig);
      }

      console.log("\n[BUILD] Build completed successfully");
    } catch (error) {
      console.error("[ERROR] Build failed:", error.message);
      throw error;
    }
  }

  async ensureOutputDirectory() {
    const shouldClean = this.config.cleanOutputDir ?? false;

    if (shouldClean) {
      await fs.emptyDir(this.outputDir);
      console.log("[BUILD] Output directory cleaned");
    } else {
      await fs.ensureDir(this.outputDir);
      console.log("[BUILD] Output directory ready");
    }
  }

  async buildPage(pageConfig) {
    console.log(`[PAGE] Building: ${pageConfig.name}`);

    try {
      const template = await this.loadTemplate();
      const markdownContent = await this.loadMarkdownContent(
        pageConfig.markdownFile,
      );
      const htmlContent = this.md.render(markdownContent);

      const pageTitle = this.resolvePageTitle(pageConfig, markdownContent);
      const backToTopElements = this.generateBackToTopElements(pageConfig);
      const musicPlayer = this.generateMusicPlayer(pageConfig);

      let encryptionData = "";
      let decryptionScript = "";
      let finalContent = htmlContent;

      // 如果配置了密码，进行加密
      if (pageConfig.password) {
        console.log(`[PAGE] Encrypting content for: ${pageConfig.name}`);
        const encrypted = await this.encryptContent(
          htmlContent,
          pageConfig.password,
        );

        encryptionData = `
                    <div id="password-overlay" class="password-overlay">
                        <div class="password-dialog">
                            <i class="ri-lock-line password-icon"></i>
                            <h2>内容已加密</h2>
                            <p>请输入密码以查看内容</p>
                            <div class="password-input-group">
                                <input type="password" id="password-input" placeholder="请输入密码" autocomplete="off" />
                                <button onclick="decryptContent()">
                                    <i class="ri-key-2-line"></i>
                                    <span>解锁</span>
                                </button>
                            </div>
                            <div id="error-message" class="error-message">
                                <i class="ri-error-warning-line"></i>
                                <span id="error-text"></span>
                            </div>
                        </div>
                    </div>
                    <div id="encrypted-content" 
                         data-encrypted="${encrypted.encrypted}" 
                         data-iv="${encrypted.iv}" 
                         data-salt="${encrypted.salt}"
                         style="display: none;">
                    </div>
                `;

        decryptionScript = this.generateDecryptionScript();
        finalContent = ""; // 加密时清空内容区域
      }

      const templateData = {
        [this.TEMPLATE_VARS.TITLE]: pageTitle,
        [this.TEMPLATE_VARS.PAGE_TITLE]: pageTitle,
        [this.TEMPLATE_VARS.MUSIC_PLAYER]: musicPlayer,
        [this.TEMPLATE_VARS.MARKDOWN_CONTENT]: finalContent,
        [this.TEMPLATE_VARS.BACK_TO_TOP_BUTTON]: backToTopElements.button,
        [this.TEMPLATE_VARS.BACK_TO_TOP_SCRIPT]: backToTopElements.script,
        [this.TEMPLATE_VARS.ENCRYPTION_DATA]: encryptionData,
        [this.TEMPLATE_VARS.DECRYPTION_SCRIPT]: decryptionScript,
      };

      let html = this.renderTemplate(template, templateData);
      html = await this.minifyHTML(html);

      await this.writeOutputFile(pageConfig.name, html);

      console.log(`[PAGE] Successfully built: ${pageConfig.name}.html`);
    } catch (error) {
      console.error(
        `[ERROR] Failed to build page ${pageConfig.name}:`,
        error.message,
      );
      throw error;
    }
  }

  generateMusicPlayer(pageConfig) {
    if (!pageConfig.musicFile) {
      return "";
    }

    const musicLabel = pageConfig.musicLabel || "背景音乐";
    return `
        <div class="music-panel">
            <div class="music-header">
                <i class="ri-music-2-line"></i>
                <div class="music-title">${musicLabel}</div>
            </div>
            <div class="custom-audio-player">
                <div class="audio-controls">
                    <button class="play-btn" aria-label="播放/暂停">
                        <i class="ri-play-fill"></i>
                    </button>
                    <div class="audio-time">
                        <span class="current-time">0:00</span>
                        <span>/</span>
                        <span class="duration">0:00</span>
                    </div>
                    <div class="volume-control">
                        <button class="volume-btn" aria-label="静音">
                            <i class="ri-volume-up-line"></i>
                        </button>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-bar"></div>
                </div>
            </div>
            <audio src="${pageConfig.musicFile}"></audio>
        </div>
        <div class="control-buttons">
            <button class="control-btn" onclick="toggleMusicPlayer()" aria-label="音乐播放器" id="musicBtn">
                <i class="ri-music-line"></i>
            </button>
        </div>
    `;
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
                    const unlockBtn = document.querySelector('.password-input-group button');
                    const password = passwordInput.value;

                    errorMessage.style.display = 'none';

                    if (!password) {
                        errorText.textContent = '请输入密码';
                        errorMessage.style.display = 'flex';
                        passwordInput.focus();
                        return;
                    }

                    unlockBtn.classList.add('loading');
                    unlockBtn.disabled = true;

                    try {
                        const encryptedData = encryptedDiv.dataset.encrypted;
                        const ivData = encryptedDiv.dataset.iv;
                        const saltData = encryptedDiv.dataset.salt;

                        const encrypted = base64ToBuffer(encryptedData);
                        const iv = base64ToBuffer(ivData);
                        const salt = base64ToBuffer(saltData);

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
                            encrypted
                        );

                        const decryptedText = new TextDecoder().decode(decrypted);
                        
                        const contentDiv = document.querySelector('.markdown-content');
                        contentDiv.innerHTML = decryptedText;
                        
                        const overlay = document.getElementById('password-overlay');
                        overlay.style.animation = 'fadeOut 0.3s ease';
                        setTimeout(() => {
                            overlay.style.display = 'none';
                        }, 300);
                        
                        sessionStorage.setItem('decrypted_' + window.location.pathname, 'true');
                        
                    } catch (error) {
                        console.error('解密失败:', error);
                        errorText.textContent = '密码错误，请重试';
                        errorMessage.style.display = 'flex';
                        passwordInput.value = '';
                        passwordInput.focus();
                    } finally {
                        unlockBtn.classList.remove('loading');
                        unlockBtn.disabled = false;
                    }
                }

                window.addEventListener('DOMContentLoaded', () => {
                    const encryptedDiv = document.getElementById('encrypted-content');
                    if (encryptedDiv) {
                        const passwordInput = document.getElementById('password-input');
                        if (passwordInput) {
                            passwordInput.addEventListener('keypress', (e) => {
                                if (e.key === 'Enter') {
                                    decryptContent();
                                }
                            });
                            
                            passwordInput.addEventListener('input', () => {
                                const errorMessage = document.getElementById('error-message');
                                if (errorMessage.style.display === 'flex') {
                                    errorMessage.style.display = 'none';
                                }
                            });
                            
                            setTimeout(() => passwordInput.focus(), 100);
                        }
                    }
                });
            </script>
        `;
  }

  async loadMarkdownContent(markdownFile) {
    try {
      return await fs.readFile(markdownFile, "utf8");
    } catch (error) {
      throw new Error(
        `Failed to load markdown file ${markdownFile}: ${error.message}`,
      );
    }
  }

  resolvePageTitle(pageConfig, markdownContent) {
    if (!pageConfig.useMarkdownTitle) {
      return pageConfig.title || "Untitled";
    }

    const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : pageConfig.title || "Untitled";
  }

  generateBackToTopElements(pageConfig) {
    if (!pageConfig.showBackToTop) {
      return { button: "", script: "" };
    }

    const button =
      '<button class="back-to-top" onclick="scrollToTop()" id="backToTopBtn">' +
      '<i class="ri-arrow-up-line"></i></button>';

    const offset = pageConfig.backToTopOffset || 300;
    const script = `
            const backToTopBtn = document.getElementById('backToTopBtn');
            window.addEventListener('scroll', () => {
                if (window.pageYOffset > ${offset}) {
                    backToTopBtn.classList.add('show');
                } else {
                    backToTopBtn.classList.remove('show');
                }
            });
        `;

    return { button, script };
  }

  renderTemplate(template, data) {
    let result = template;

    for (const [key, value] of Object.entries(data)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(placeholder, value || "");
    }

    return result;
  }

  async minifyHTML(html) {
    try {
      return await minifyHTML(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
      });
    } catch (error) {
      console.warn("[WARN] HTML minification failed, using original content");
      return html;
    }
  }

  async writeOutputFile(pageName, content) {
    const outputPath = path.join(this.outputDir, `${pageName}.html`);
    await fs.writeFile(outputPath, content, "utf8");
  }
}

// Execute build
new SimpleBuilder().build().catch((error) => {
  console.error("[FATAL] Build process terminated with error");
  process.exit(1);
});
