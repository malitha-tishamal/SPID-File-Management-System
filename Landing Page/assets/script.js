/**
 * SPID File Management System v3.0.0 — Landing Page Script
 * Southern Provincial Irrigation Department, Galle, Sri Lanka
 * Vanilla JavaScript (Zero external runtime dependencies)
 */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNav();
  initNavbarScroll();
  initPortalTabs();
  initFaqAccordion();
  initBackToTop();
  initFileSearchDemo();
  initAppLinks();
  initFeatureFilters();
});

/* ===================================================================
   1. Theme Management (Light / Dark Mode)
   =================================================================== */
function initTheme() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const mobileToggleBtn = document.getElementById('mobileThemeToggleBtn');
  const storedTheme = localStorage.getItem('spid_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const currentTheme = storedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', currentTheme);

  function toggle() {
    const active = document.documentElement.getAttribute('data-theme');
    const next = active === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('spid_theme', next);
  }

  if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  if (mobileToggleBtn) mobileToggleBtn.addEventListener('click', toggle);
}

/* ===================================================================
   2. Mobile Navigation Drawer
   =================================================================== */
function initMobileNav() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const closeBtn = document.getElementById('mobileDrawerClose');
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('backdropOverlay');
  const mobileLinks = document.querySelectorAll('.mobile-menu-link');

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  mobileLinks.forEach(link => {
    link.addEventListener('click', closeDrawer);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });
}

/* ===================================================================
   3. Navbar Scroll Elevation & Active Spy
   =================================================================== */
function initNavbarScroll() {
  const header = document.querySelector('.site-header');
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;

    if (header) {
      if (scrollY > 40) {
        header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.08)';
      } else {
        header.style.boxShadow = 'none';
      }
    }

    // Scroll Spy
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');

      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.style.color = 'var(--brand-primary)';
          } else {
            link.style.color = '';
          }
        });
      }
    });
  }, { passive: true });
}

/* ===================================================================
   4. Portal Tabs Switcher
   =================================================================== */
function initPortalTabs() {
  const tabs = document.querySelectorAll('.portal-tab-btn');
  const panes = document.querySelectorAll('.portal-tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-target');

      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

/* ===================================================================
   5. Interactive File Search & Location Simulation
   =================================================================== */
const DEMO_FILES = [
  {
    code: 'SPID/IRR/GAL/2026/048',
    title: 'Ging Ganga Flood Protection & Salinity Barrier Scheme',
    section: 'Irrigation Planning & Design',
    locker: 'LK-04',
    shelf: 'Shelf 02',
    position: 'Front',
    sheets: 38,
    pages: 246,
    priority: 'HIGH',
    status: 'ACTIVE / REGISTERED',
    custody: 'Central Record Room (B-02)'
  },
  {
    code: 'SPID/IRR/MAT/2025/112',
    title: 'Nilwala Ganga Basin Water Resource Optimization Project',
    section: 'Water Management & Hydrology',
    locker: 'LK-08',
    shelf: 'Shelf 05',
    position: 'Middle',
    sheets: 52,
    pages: 310,
    priority: 'NORMAL',
    status: 'ISSUED / IN USE',
    custody: 'Matara Regional Engineering Office'
  },
  {
    code: 'SPID/IRR/HAM/2025/089',
    title: 'Kirindi Oya Left Bank Canal Rehabilitation',
    section: 'Engineering Central Registry',
    locker: 'LK-12',
    shelf: 'Shelf 01',
    position: 'Back',
    sheets: 19,
    pages: 140,
    priority: 'HIGH',
    status: 'ACTIVE / REGISTERED',
    custody: 'Hambantota Regional Engineering Office'
  },
  {
    code: 'SPID/ADM/GAL/2026/015',
    title: 'Southern Province Technical Cadre & Engineering Deployment',
    section: 'Administration & HR Division',
    locker: 'LK-01',
    shelf: 'Shelf 03',
    position: 'Front',
    sheets: 12,
    pages: 84,
    priority: 'NORMAL',
    status: 'ACTIVE / REGISTERED',
    custody: 'Central Archive Repository'
  }
];

function initFileSearchDemo() {
  const input = document.getElementById('fileSearchInput');
  const codeEl = document.getElementById('demoFileCode');
  const titleEl = document.getElementById('demoFileTitle');
  const sectionEl = document.getElementById('demoFileSection');
  const lockerEl = document.getElementById('demoFileLocker');
  const shelfEl = document.getElementById('demoFileShelf');
  const posEl = document.getElementById('demoFilePosition');
  const sheetsEl = document.getElementById('demoFileSheets');
  const pagesEl = document.getElementById('demoFilePages');
  const statusEl = document.getElementById('demoFileStatus');
  const priorityEl = document.getElementById('demoFilePriority');

  if (!input) return;

  function renderRecord(file) {
    if (codeEl) codeEl.textContent = file.code;
    if (titleEl) titleEl.textContent = file.title;
    if (sectionEl) sectionEl.textContent = file.section;
    if (lockerEl) lockerEl.textContent = file.locker;
    if (shelfEl) shelfEl.textContent = file.shelf;
    if (posEl) posEl.textContent = file.position;
    if (sheetsEl) sheetsEl.textContent = file.sheets;
    if (pagesEl) pagesEl.textContent = file.pages;
    if (statusEl) statusEl.textContent = file.status;
    if (priorityEl) {
      priorityEl.textContent = `${file.priority} PRIORITY`;
      priorityEl.className = 'mockup-priority-badge ' + (file.priority === 'HIGH' ? 'priority-high' : 'badge-normal');
    }
  }

  input.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderRecord(DEMO_FILES[0]);
      return;
    }
    const match = DEMO_FILES.find(f => 
      f.code.toLowerCase().includes(q) || 
      f.title.toLowerCase().includes(q) ||
      f.section.toLowerCase().includes(q)
    );
    if (match) {
      renderRecord(match);
    }
  });

  // Expose preset switcher function
  window.loadDemoPreset = function(index) {
    if (DEMO_FILES[index]) {
      input.value = DEMO_FILES[index].code;
      renderRecord(DEMO_FILES[index]);
    }
  };
}

/* ===================================================================
   6. FAQ Accordion
   =================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question-btn');
    const answer = item.querySelector('.faq-answer');

    if (questionBtn && answer) {
      questionBtn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        // Close other items
        faqItems.forEach(otherItem => {
          if (otherItem !== item) {
            otherItem.classList.remove('active');
            const otherAns = otherItem.querySelector('.faq-answer');
            if (otherAns) otherAns.style.maxHeight = null;
          }
        });

        if (isActive) {
          item.classList.remove('active');
          answer.style.maxHeight = null;
        } else {
          item.classList.add('active');
          answer.style.maxHeight = answer.scrollHeight + 32 + 'px';
        }
      });
    }
  });
}

/* ===================================================================
   7. Back to Top Button
   =================================================================== */
function initBackToTop() {
  const btn = document.getElementById('backToTopBtn');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 500) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ===================================================================
   8. Smart Application Navigation Links
   =================================================================== */
function initAppLinks() {
  // If the user runs the landing page under file:// or WAMP,
  // we intelligently map links to localhost:3000 (Next.js server) if accessible,
  // or preserve direct relative route URLs.
  const isDirectFile = window.location.protocol === 'file:';
  const defaultNextPort = 'http://localhost:3000';

  document.querySelectorAll('a[data-app-route]').forEach(link => {
    const route = link.getAttribute('data-app-route');
    if (isDirectFile) {
      link.setAttribute('href', `${defaultNextPort}${route}`);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      // In web server, point directly to root relative route
      link.setAttribute('href', route);
    }
  });
}

/* ===================================================================
   9. Feature Category Filtering
   =================================================================== */
function initFeatureFilters() {
  const filterBtns = document.querySelectorAll('.feature-filter-btn');
  const cards = document.querySelectorAll('.feature-card[data-category]');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-filter');

      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      cards.forEach(card => {
        const cardCat = card.getAttribute('data-category') || '';
        if (cat === 'all' || cardCat.split(' ').includes(cat)) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });
}
