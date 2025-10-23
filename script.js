class MemoryBook {
  constructor() {
    this.chapters = window.CHAPTERS_DATA || [];
    this.currentIndex = window.CURRENT_INDEX ?? -1;
    this.siteInfo = window.SITE_INFO || {};
    this.isHome = window.IS_HOME || false;

    this.totalPages = this.chapters.length;
    this.tocCurrentPage = 0;
    this.tocItemsPerPage = 6;

    this.currentTheme = this.getStoredTheme() || this.getSystemTheme();
    this.applyTheme(this.currentTheme);

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateNavigation();
    this.updateNavigationVisibility();

    this.updateCopyrightInfo();

    setTimeout(() => {
      this.hideLoading();
    }, 800);
  }

  updateCopyrightInfo() {
    document.getElementById("copyrightEmail").textContent =
      this.siteInfo.email || "";
  }

  setupEventListeners() {
    // 底部导航事件
    document
      .getElementById("homeBtn")
      .addEventListener("click", () => this.goToHome());
    document
      .getElementById("tocBtn")
      .addEventListener("click", () => this.showTOC());
    document
      .getElementById("copyrightBtn")
      .addEventListener("click", () => this.showCopyright());
    document
      .getElementById("prevBtn")
      .addEventListener("click", () => this.prevPage());
    document
      .getElementById("nextBtn")
      .addEventListener("click", () => this.nextPage());

    // 主题切换事件
    document
      .getElementById("themeToggle")
      .addEventListener("click", () => this.toggleTheme());

    // 弹框关闭事件
    document
      .getElementById("tocModalClose")
      .addEventListener("click", () => this.hideTOC());
    document
      .getElementById("copyrightModalClose")
      .addEventListener("click", () => this.hideCopyright());

    // 点击弹框背景关闭
    document.getElementById("tocModal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.hideTOC();
    });
    document.getElementById("copyrightModal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.hideCopyright();
    });

    // 键盘导航
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.prevPage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.nextPage();
      } else if (e.key === "Home") {
        e.preventDefault();
        this.goToHome();
      } else if (e.key === "Escape") {
        this.hideTOC();
        this.hideCopyright();
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        this.toggleTheme();
      }
    });

    // 系统主题变化监听
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        if (!localStorage.getItem("memory-book-theme")) {
          const systemTheme = e.matches ? "dark" : "light";
          this.applyTheme(systemTheme);
        }
      });

    // 响应式目录布局
    window.addEventListener("resize", () => {
      this.updateTocItemsPerPage();
    });
    this.updateTocItemsPerPage();
  }

  updateTocItemsPerPage() {
    const isSmallScreen = window.innerWidth <= 768;
    this.tocItemsPerPage = isSmallScreen ? 2 : 6;

    const tocModal = document.getElementById("tocModal");
    if (tocModal.classList.contains("show")) {
      this.renderTOC();
    }
  }

  updateNavigationVisibility() {
    const bottomNav = document.getElementById("bottomNav");
    if (this.isHome) {
      bottomNav.style.display = "none";
    } else {
      bottomNav.style.display = "flex";
    }
  }

  goToHome() {
    window.location.href = "/";
  }

  prevPage() {
    if (this.currentIndex > 0) {
      const prevChapter = this.chapters[this.currentIndex - 1];
      window.location.href = `/chapter/${prevChapter.slug}/`;
    } else if (this.currentIndex === 0) {
      window.location.href = "/";
    }
  }

  nextPage() {
    if (this.currentIndex < this.chapters.length - 1) {
      const nextChapter = this.chapters[this.currentIndex + 1];
      window.location.href = `/chapter/${nextChapter.slug}/`;
    }
  }

  startReading() {
    if (this.chapters.length > 0) {
      window.location.href = `/chapter/${this.chapters[0].slug}/`;
    }
  }

  updateNavigation() {
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const pageInfo = document.getElementById("pageInfo");

    if (this.isHome) {
      prevBtn.disabled = true;
      nextBtn.disabled = this.chapters.length === 0;
      pageInfo.textContent = `1 / ${this.totalPages}`;
    } else {
      prevBtn.disabled = false;
      nextBtn.disabled = this.currentIndex === this.chapters.length - 1;
      pageInfo.textContent = `${this.currentIndex + 1} / ${this.totalPages}`;
    }
  }

  showTOC() {
    this.tocCurrentPage = 0;
    this.renderTOC();
    document.getElementById("tocModal").classList.add("show");
  }

  hideTOC() {
    document.getElementById("tocModal").classList.remove("show");
  }

  renderTOC() {
    const tocGrid = document.getElementById("tocGrid");
    const tocPagination = document.getElementById("tocPagination");

    const totalItems = this.chapters.length;

    if (totalItems === 0) {
      tocGrid.innerHTML = '<div class="no-content">暂无章节内容</div>';
      tocPagination.innerHTML = "";
      return;
    }

    const totalPages = Math.ceil(totalItems / this.tocItemsPerPage);

    const startIndex = this.tocCurrentPage * this.tocItemsPerPage;
    const endIndex = Math.min(startIndex + this.tocItemsPerPage, totalItems);
    const currentItems = this.chapters.slice(startIndex, endIndex);

    tocGrid.innerHTML = currentItems
      .map((chapter, index) => {
        const actualIndex = startIndex + index;
        const isCurrent = actualIndex === this.currentIndex;
        const isEncrypted = chapter.isEncrypted || false;

        // 构建类名
        const cardClasses = [
          "toc-card",
          isCurrent ? "current" : "",
          isEncrypted ? "encrypted" : "",
        ]
          .filter(Boolean)
          .join(" ");

        // 加密徽章
        const lockBadge = isEncrypted
          ? '<span class="toc-card-lock-badge"><i class="ri-lock-line"></i></span>'
          : "";

        return `
            <div class="${cardClasses}" onclick="memoryBook.goToChapter('${chapter.slug}')">
                ${lockBadge}
                <div>
                    <div class="toc-card-title">${this.escapeHtml(chapter.title || "未知章节")}</div>
                    ${chapter.subtitle ? `<div class="toc-card-subtitle">${this.escapeHtml(chapter.subtitle)}</div>` : ""}
                </div>
                ${chapter.category ? `<div class="toc-card-category"><i class="ri-folder-line"></i> ${this.escapeHtml(chapter.category)}</div>` : ""}
            </div>
        `;
      })
      .join("");

    if (totalPages > 1) {
      tocPagination.innerHTML = `
            <button onclick="memoryBook.prevTocPage()" ${this.tocCurrentPage === 0 ? "disabled" : ""}>上一页</button>
            <span>${this.tocCurrentPage + 1} / ${totalPages}</span>
            <button onclick="memoryBook.nextTocPage()" ${this.tocCurrentPage === totalPages - 1 ? "disabled" : ""}>下一页</button>
        `;
    } else {
      tocPagination.innerHTML = "";
    }
  }

  prevTocPage() {
    if (this.tocCurrentPage > 0) {
      this.tocCurrentPage--;
      this.renderTOC();
    }
  }

  nextTocPage() {
    const totalPages = Math.ceil(this.chapters.length / this.tocItemsPerPage);
    if (this.tocCurrentPage < totalPages - 1) {
      this.tocCurrentPage++;
      this.renderTOC();
    }
  }

  goToChapter(slug) {
    window.location.href = `/chapter/${slug}/`;
  }

  showCopyright() {
    document.getElementById("copyrightModal").classList.add("show");
  }

  hideCopyright() {
    document.getElementById("copyrightModal").classList.remove("show");
  }

  // 主题相关方法
  getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  getStoredTheme() {
    return localStorage.getItem("memory-book-theme");
  }

  toggleTheme() {
    const newTheme = this.currentTheme === "light" ? "dark" : "light";
    this.applyTheme(newTheme);
    localStorage.setItem("memory-book-theme", newTheme);
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
  }

  hideLoading() {
    const loadingOverlay = document.getElementById("loadingOverlay");
    loadingOverlay.classList.add("hidden");
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 600);
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
const memoryBook = new MemoryBook();
