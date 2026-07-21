/**
 * ProjectNest Application Core Logic
 * Full-Stack Client Communication Layer with Flask REST APIs & SQLite
 */

const app = {
    API_URL: window.location.origin === 'null' || window.location.protocol === 'file:' ? "http://127.0.0.1:5000/api" : "/api",

    // Global State Database Cache
  
  // Global State Database Cache
  db: {
    users: [],
    projects: [],
    components: [],
    mentors: [],
    orders: [],
    appointments: [],
    forumThreads: [],
    notifications: [],
    currentUser: null,
    cart: []
  },

  // Initialize Data
  init: async function() {
    this.theme.init();
    this.router.init();
    
    // Load state from server APIs
    await this.db.load();

    this.auth.init();
    this.cart.init();
    this.notif.init();
    this.ai.init();
    this.resume.init();
    
    // Render landing visual elements
    this.landing.render();
  }
};

// --- API DATABASE LOADER ---
app.db.load = async function() {
  try {
    const [projs, comps, ments, forum] = await Promise.all([
      fetch(app.API_URL + '/projects').then(res => res.json()),
      fetch(app.API_URL + '/components').then(res => res.json()),
      fetch(app.API_URL + '/mentors').then(res => res.json()),
      fetch(app.API_URL + '/forum').then(res => res.json())
    ]);

    this.projects = projs;
    this.components = comps;
    this.mentors = ments;
    this.forumThreads = forum;
  } catch (err) {
    console.error("Connection to Flask API failed", err);
    app.toast.show("Backend server connection failed! Run server.py on port 5000.", "error");
  }

  // Load current session
  const sessionUser = sessionStorage.getItem('nest_current_user');
  if (sessionUser) {
    this.currentUser = JSON.parse(sessionUser);
    await this.loadUserWorkspace();
  }
};

// Loader for active user specific logs
app.db.loadUserWorkspace = async function() {
  if (!this.currentUser) return;
  try {
    const email = this.currentUser.email;
    const [purchased, appointments, orders] = await Promise.all([
      fetch(app.API_URL + `/dashboard/projects?email=${encodeURIComponent(email)}`).then(res => res.json()),
      fetch(app.API_URL + `/appointments?email=${encodeURIComponent(email)}`).then(res => res.json()),
      fetch(app.API_URL + `/orders?email=${encodeURIComponent(email)}`).then(res => res.json())
    ]);

    this.currentUser.purchasedProjects = purchased;
    this.appointments = appointments;
    this.orders = orders;
  } catch (err) {
    console.error("Failed to load user workspace", err);
  }
};

// Quick Helper to resolve mentor profile photo path
app.db.getMentorPic = function(path) {
  const base = window.location.origin === 'null' || window.location.protocol === 'file:' ? 'http://127.0.0.1:5000' : window.location.origin;
  if (!path) return 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80';
  if (path.startsWith('http') || path.startsWith('/')) {
    if (path.startsWith('/uploads')) {
      return base + path;
    }
    return path;
  }
  return base + '/uploads/' + path;
};


// --- ROUTING SYSTEM ---
app.router = {
  activeView: 'landing',
  
  init: function() {
    window.addEventListener('hashchange', () => {
      this.handleHash();
    });
    this.handleHash();
  },

  navigate: function(viewId, params = {}) {
    window.location.hash = viewId + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
  },

  handleHash: async function() {
    const hash = window.location.hash.substring(1) || 'landing';
    const parts = hash.split('?');
    const viewId = parts[0];
    const params = parts[1] ? Object.fromEntries(new URLSearchParams(parts[1])) : {};

    // Validate access for admin panel
    if (viewId === 'admin' && (!app.db.currentUser || app.db.currentUser.role !== 'admin')) {
      app.toast.show('Admin authorization required!', 'error');
      this.navigate('landing');
      return;
    }

    // Hide all view panes
    document.querySelectorAll('.view-pane').forEach(pane => {
      pane.style.display = 'none';
    });

    // Remove active highlight from navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });

    // Display targeted view
    const targetPane = document.getElementById('view-' + viewId);
    if (targetPane) {
      targetPane.style.display = 'block';
      this.activeView = viewId;
      
      // Update nav link indicator
      const activeLink = document.getElementById('nav-' + viewId);
      if (activeLink) activeLink.classList.add('active');

      // Dispatch load handlers
      await this.triggerViewLoad(viewId, params);
      window.scrollTo(0, 0);
    }
  },

  triggerViewLoad: async function(viewId, params) {
    if (viewId === 'landing') {
      app.landing.render();
    } else if (viewId === 'projects') {
      await app.db.load();
      app.projects.renderList();
    } else if (viewId === 'project-details') {
      app.projects.renderDetails(params.id);
    } else if (viewId === 'mentorship') {
      await app.db.load();
      app.mentors.renderList();
    } else if (viewId === 'store') {
      await app.db.load();
      app.store.renderList();
    } else if (viewId === 'cart') {
      app.cart.renderPage();
    } else if (viewId === 'checkout') {
      app.cart.renderCheckout();
    } else if (viewId === 'forum') {
      await app.db.load();
      app.forum.render();
    } else if (viewId === 'dashboard') {
      await app.db.loadUserWorkspace();
      app.dashboard.render();
    } else if (viewId === 'admin') {
      await app.db.load();
      app.admin.render();
    }
  }
};


// --- THEME MODULE ---
app.theme = {
  currentTheme: 'dark',
  init: function() {
    const saved = localStorage.getItem('nest_theme') || 'dark';
    this.set(saved);
  },
  toggle: function() {
    const next = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.set(next);
  },
  set: function(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nest_theme', theme);
    
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.innerHTML = theme === 'dark' 
        ? '<i class="fa-solid fa-sun"></i>' 
        : '<i class="fa-solid fa-moon"></i>';
    }
  }
};


// --- USER AUTHENTICATION ---
app.auth = {
  activeTab: 'login',
  
  init: function() {
    this.renderHeaderAuth();
  },

  toggleTab: function(tab) {
    this.activeTab = tab;
    document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('auth-tab-signup').classList.toggle('active', tab === 'signup');
    document.getElementById('auth-form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('auth-form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  },

  renderHeaderAuth: function() {
    const container = document.getElementById('nav-auth-section');
    if (!container) return;

    if (app.db.currentUser) {
      let dashboardBtn = `<span onclick="app.router.navigate('dashboard')" style="font-weight:600; cursor:pointer;">${app.db.currentUser.name}</span>`;
      if (app.db.currentUser.role === 'admin') {
        dashboardBtn = `<span onclick="app.router.navigate('admin')" style="font-weight:600; color:var(--color-primary); cursor:pointer;"><i class="fa-solid fa-lock"></i> Admin Panel</span>`;
      }

      container.innerHTML = `
        <div class="nav-profile">
          <div class="nav-profile-trigger">
            <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80" alt="avatar">
            ${dashboardBtn}
            <i class="fa-solid fa-sign-out-alt" style="cursor:pointer; color:var(--text-muted); margin-left:8px;" onclick="app.auth.logout()" title="Logout"></i>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <button class="btn-primary" onclick="app.router.navigate('auth')"><i class="fa-solid fa-user"></i> Login / Register</button>
      `;
    }
  },

  loginSubmit: async function() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;

    if (!email || !pass) {
      app.toast.show('Please fill all login fields', 'error');
      return;
    }

    try {
      const response = await fetch(app.API_URL + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      
      const resData = await response.json();
      if (!response.ok) {
        app.toast.show(resData.error || 'Login failed!', 'error');
        return;
      }

      app.db.currentUser = resData;
      sessionStorage.setItem('nest_current_user', JSON.stringify(resData));
      
      this.renderHeaderAuth();
      app.toast.show('Welcome back, ' + resData.name + '!', 'success');
      
      if (resData.role === 'admin') {
        app.router.navigate('admin');
      } else {
        await app.db.loadUserWorkspace();
        app.router.navigate('dashboard');
      }
    } catch (err) {
      app.toast.show('Failed connecting to login server!', 'error');
    }
  },

  registerSubmit: async function() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const mobile = document.getElementById('reg-mobile').value;
    const college = document.getElementById('reg-college').value;
    const uni = document.getElementById('reg-uni').value;
    const branch = document.getElementById('reg-branch').value;
    const sem = document.getElementById('reg-sem').value;
    const pass = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm-pass').value;

    if (!name || !email || !mobile || !college || !pass || !confirm) {
      app.toast.show('Please complete all registration fields', 'error');
      return;
    }

    if (pass !== confirm) {
      app.toast.show('Passwords do not match!', 'error');
      return;
    }

    // Request OTP from backend
    try {
      app.toast.show('Sending OTP to ' + email + '...', 'info');
      const otpRequest = await fetch(app.API_URL + '/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const otpRequestData = await otpRequest.json();
      if (!otpRequest.ok) {
        app.toast.show(otpRequestData.error || 'Failed to send OTP. Please try again.', 'error');
        return;
      }
      app.toast.show('OTP sent successfully!', 'success');
    } catch (err) {
      console.error(err);
      app.toast.show('Failed connecting to OTP server', 'error');
      return;
    }

    const otp = prompt('OTP Verification: An OTP has been sent to ' + email + '. Enter the code to verify:');
    if (!otp) {
      app.toast.show('Registration cancelled. OTP is required.', 'error');
      return;
    }

    try {
      const response = await fetch(app.API_URL + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, name, mobile, college, uni, branch, semester: sem, password: pass, otp
        })
      });
      const resData = await response.json();
      if (!response.ok) {
        app.toast.show(resData.error || 'Registration failed!', 'error');
        return;
      }

      app.toast.show('Account created successfully! Please Sign In.', 'success');
      this.toggleTab('login');
    } catch (err) {
      app.toast.show('Server registration connection error', 'error');
    }
  },

  logout: function() {
    app.db.currentUser = null;
    sessionStorage.removeItem('nest_current_user');
    this.renderHeaderAuth();
    app.toast.show('Logged out successfully.', 'info');
    app.router.navigate('landing');
  },

  forgotPassword: function() {
    alert('Mock Password Recovery: Check terminal backend console logs or reset password locally.');
  }
};


// --- LANDING PAGE RENDERING ---
app.landing = {
  sliderTimer: null,
  sliderInterval: null,
  tickerInterval: null,

  render: function() {
    // Render Category Cards
    const cats = [
      { id: 'ECE', name: 'Electronics & Comm.', icon: 'fa-microchip', color: 'badge-ece' },
      { id: 'CSE', name: 'Computer Science', icon: 'fa-laptop-code', color: 'badge-cse' },
      { id: 'Mech', name: 'Mechanical Engineering', icon: 'fa-gears', color: 'badge-mech' },
      { id: 'Civil', name: 'Civil Engineering', icon: 'fa-helmet-safety', color: 'badge-civil' },
      { id: 'EE', name: 'Electrical Engineering', icon: 'fa-bolt', color: 'badge-ee' }
    ];
    
    const catContainer = document.getElementById('landing-categories');
    if (catContainer) {
      catContainer.innerHTML = cats.map(c => `
        <div class="category-card glass-panel" onclick="app.landing.clickCategory('${c.id}')">
          <div class="category-icon"><i class="fa-solid ${c.icon}"></i></div>
          <h3>${c.name}</h3>
        </div>
      `).join('');
    }

    // Render 3 Featured Projects
    const featured = app.db.projects.slice(0, 3);
    const projContainer = document.getElementById('landing-featured-projects');
    if (projContainer) {
      projContainer.innerHTML = featured.map(p => app.projects.createCardHtml(p)).join('');
    }

    // Initialize premium landing components
    this.initSlider();
    this.initTicker();
  },

  clickCategory: function(catId) {
    app.router.navigate('projects');
    setTimeout(() => {
      const chk = document.querySelector(`.filter-branch[value="${catId}"]`);
      if (chk) {
        chk.checked = true;
        app.projects.applyFilters();
      }
    }, 100);
  },

  initSlider: function() {
    const container = document.querySelector('.hero-slider-container');
    if (!container) return;

    const slides = container.querySelectorAll('.hero-slide');
    const indicator = document.getElementById('slider-dash-indicator');
    if (slides.length === 0) return;

    // Reset indicator dashes to match number of slides dynamically
    if (indicator) {
      indicator.innerHTML = Array.from(slides).map(() => `
        <div class="progress-dash"><div class="progress-dash-fill"></div></div>
      `).join('');
    }

    // Clear previous runs
    if (this.sliderTimer) clearTimeout(this.sliderTimer);
    if (this.sliderInterval) clearInterval(this.sliderInterval);

    let currentIdx = 0;
    const self = this;

    function showSlide(idx) {
      // Clear interval/timer for the previous slide transition
      clearInterval(self.sliderInterval);
      clearTimeout(self.sliderTimer);

      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === idx);
        const video = slide.querySelector('video');
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      });

      const dashes = indicator ? indicator.querySelectorAll('.progress-dash-fill') : [];
      dashes.forEach((dash, i) => {
        dash.style.width = i < idx ? '100%' : '0%';
      });

      const activeSlide = slides[idx];
      const duration = parseInt(activeSlide.getAttribute('data-duration')) || 5000;
      
      const video = activeSlide.querySelector('video');
      if (video) {
        video.play().catch(err => console.log('Autoplay blocked:', err));
      }

      const startTime = Date.now();
      const activeDash = dashes[idx];

      if (activeDash) {
        self.sliderInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const pct = Math.min((elapsed / duration) * 100, 100);
          activeDash.style.width = pct + '%';
          if (pct >= 100) {
            clearInterval(self.sliderInterval);
          }
        }, 50);
      }

      self.sliderTimer = setTimeout(() => {
        currentIdx = (currentIdx + 1) % slides.length;
        showSlide(currentIdx);
      }, duration);
    }

    showSlide(0);
  },

  initTicker: function() {
    const tickerContainer = document.getElementById('live-activity-ticker');
    if (!tickerContainer) return;

    const items = tickerContainer.querySelectorAll('.ticker-item');
    if (items.length === 0) return;

    if (this.tickerInterval) clearInterval(this.tickerInterval);

    let currentIdx = 0;
    this.tickerInterval = setInterval(() => {
      items[currentIdx].classList.remove('active');
      currentIdx = (currentIdx + 1) % items.length;
      items[currentIdx].classList.add('active');
    }, 4000);
  }
};


// --- PROJECTS DIRECTORY & DETAILS ---
app.projects = {
  activeTab: 'desc',

  createCardHtml: function(p) {
    const isWished = app.db.currentUser && app.db.currentUser.wishlist && app.db.currentUser.wishlist.includes(p.id);
    const wishClass = isWished ? 'active' : '';
    const branchBadge = 'badge-' + p.category.toLowerCase();
    const diffBadge = 'badge-' + p.difficulty.toLowerCase();

    return `
      <div class="project-card glass-panel">
        <div class="project-img-wrapper">
          <img src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=360&q=80" alt="${p.title}">
          <div class="project-card-badges">
            <span class="badge ${branchBadge}">${p.category}</span>
            <span class="badge ${diffBadge}">${p.difficulty}</span>
          </div>
          <button class="project-wishlist-btn ${wishClass}" onclick="app.projects.toggleWishlist('${p.id}', event)">
            <i class="fa-solid fa-heart"></i>
          </button>
        </div>
        <div class="project-info" onclick="app.router.navigate('project-details', {id: '${p.id}'})">
          <h3>${p.title}</h3>
          <p class="project-short-desc">${p.description}</p>
          <div class="project-meta-info">
            <span><i class="fa-solid fa-clock"></i> ${p.completionTime}</span>
            <span><i class="fa-solid fa-star"></i> ${p.rating} (${p.reviewsCount} reviews)</span>
          </div>
        </div>
        <div class="project-footer">
          <div class="project-price">₹${p.price.toLocaleString()}</div>
          <button class="btn-primary" style="padding: 8px 16px; font-size:0.85rem;" onclick="app.cart.add('project', '${p.id}')">
            <i class="fa-solid fa-shopping-cart"></i> Buy Project
          </button>
        </div>
      </div>
    `;
  },

  renderList: function() {
    const filterContainer = document.getElementById('filter-branches-container');
    if (filterContainer && filterContainer.innerHTML.trim() === '') {
      const branches = ['ECE', 'CSE', 'Civil', 'Mech', 'EE'];
      filterContainer.innerHTML = branches.map(b => `
        <label class="filter-option">
          <input type="checkbox" value="${b}" class="filter-branch" onchange="app.projects.applyFilters()"> ${b} Engineering
        </label>
      `).join('');
    }

    this.applyFilters();
  },

  applyFilters: function() {
    const searchVal = document.getElementById('projects-search-input').value.toLowerCase();
    const sortVal = document.getElementById('projects-sort-select').value;
    
    const checkedBranches = Array.from(document.querySelectorAll('.filter-branch:checked')).map(el => el.value);
    const checkedDiffs = Array.from(document.querySelectorAll('.filter-difficulty:checked')).map(el => el.value);
    const priceVal = document.querySelector('input[name="filter-price"]:checked').value;

    let filtered = app.db.projects.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchVal) || 
                            p.description.toLowerCase().includes(searchVal) ||
                            p.components.some(c => c.toLowerCase().includes(searchVal));
                            
      const matchesBranch = checkedBranches.length === 0 || checkedBranches.includes(p.category);
      const matchesDiff = checkedDiffs.length === 0 || checkedDiffs.includes(p.difficulty);
      
      let matchesPrice = true;
      if (priceVal === 'under-1500') matchesPrice = p.price < 1500;
      else if (priceVal === '1500-3000') matchesPrice = p.price >= 1500 && p.price <= 3000;
      else if (priceVal === 'above-3000') matchesPrice = p.price > 3000;

      return matchesSearch && matchesBranch && matchesDiff && matchesPrice;
    });

    if (sortVal === 'price-low') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortVal === 'price-high') {
      filtered.sort((a, b) => b.price - a.price);
    } else if (sortVal === 'rating') {
      filtered.sort((a, b) => b.rating - a.rating);
    }

    const container = document.getElementById('projects-list-container');
    if (container) {
      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No matching projects found.</div>';
      } else {
        container.innerHTML = filtered.map(p => this.createCardHtml(p)).join('');
      }
    }
  },

  resetFilters: function() {
    document.querySelectorAll('.filter-branch').forEach(chk => chk.checked = false);
    document.querySelectorAll('.filter-difficulty').forEach(chk => chk.checked = false);
    document.querySelector('input[name="filter-price"][value="all"]').checked = true;
    document.getElementById('projects-search-input').value = '';
    this.applyFilters();
  },

  toggleWishlist: function(projId, event) {
    if (event) event.stopPropagation();

    if (!app.db.currentUser) {
      app.toast.show('Please log in to manage your wishlist!', 'error');
      app.router.navigate('auth');
      return;
    }

    if (!app.db.currentUser.wishlist) app.db.currentUser.wishlist = [];
    const wishlist = app.db.currentUser.wishlist;
    const index = wishlist.indexOf(projId);

    if (index > -1) {
      wishlist.splice(index, 1);
      app.toast.show('Removed from Wishlist', 'info');
    } else {
      wishlist.push(projId);
      app.toast.show('Added to Wishlist', 'success');
    }

    app.db.currentUser.wishlist = wishlist;
    sessionStorage.setItem('nest_current_user', JSON.stringify(app.db.currentUser));
    
    if (app.router.activeView === 'landing') app.landing.render();
    else if (app.router.activeView === 'projects') this.applyFilters();
  },

  renderDetails: function(projId) {
    const p = app.db.projects.find(x => x.id === projId);
    const container = document.getElementById('project-details-content');
    if (!p || !container) return;

    const mentor = app.db.mentors.find(m => m.id === p.mentorId) || app.db.mentors[0];
    const mentorPic = app.db.getMentorPic(mentor.picPath);
    
    container.innerHTML = `
      <div class="project-detail-layout">
        <div class="glass-panel" style="padding:40px;">
          <div class="detail-meta-header">
            <span class="badge badge-${p.category.toLowerCase()}">${p.category} Category</span>
            <span class="badge badge-${p.difficulty.toLowerCase()}">${p.difficulty} Level</span>
            <span class="rating-stars"><i class="fa-solid fa-star"></i> ${p.rating} (${p.reviewsCount} reviews)</span>
          </div>

          <h1>${p.title}</h1>
          <p style="color:var(--text-secondary); margin-bottom:30px; font-size:1.05rem;">${p.description}</p>

          <div class="video-player-container">
            <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=750&q=80" style="width:100%; height:100%; object-fit:cover; filter:brightness(0.6);" alt="Demo Poster">
            <button class="mock-video-play-btn" onclick="app.projects.playVideoMock(this)">
              <i class="fa-solid fa-play"></i>
            </button>
          </div>

          <div class="detail-tabs-nav">
            <button class="detail-tab-btn active" onclick="app.projects.switchTab('desc', this)">Project Overview</button>
            <button class="detail-tab-btn" onclick="app.projects.switchTab('hardware', this)">Hardware & Software</button>
            <button class="detail-tab-btn" onclick="app.projects.switchTab('mentor', this)">Mentor Information</button>
            <button class="detail-tab-btn" onclick="app.projects.switchTab('faq', this)">FAQs</button>
          </div>

          <div id="detail-tab-desc" class="detail-tab-pane active">
            <h3 style="margin-bottom:16px;">Core Features & Deliverables</h3>
            <ul style="margin-left:20px; margin-bottom:20px; display:flex; flex-direction:column; gap:10px; color:var(--text-secondary);">
              <li>Full Academic Project Thesis / Report (PDF Structure)</li>
              <li>Fully annotated Circuit Schematic & PCB Layout files</li>
              <li>Complete tested Source Code with installation guidance</li>
              <li>Pre-recorded step-by-step Hardware Assembly video instructions</li>
              <li>Free customization consultation support</li>
            </ul>
          </div>

          <div id="detail-tab-hardware" class="detail-tab-pane">
            <h3 style="margin-bottom:16px;">Electronic Components Required</h3>
            <ul style="margin-bottom:24px; display:flex; flex-wrap:wrap; gap:10px; list-style:none;">
              ${p.components.map(comp => `<li style="padding:6px 12px; background:var(--bg-input); border-radius:6px; font-size:0.9rem;"><i class="fa-solid fa-microchip" style="color:var(--color-primary); margin-right:6px;"></i>${comp}</li>`).join('')}
            </ul>

            <h3 style="margin-bottom:16px;">Software IDEs & Tools Used</h3>
            <ul style="display:flex; flex-wrap:wrap; gap:10px; list-style:none;">
              ${p.software.map(soft => `<li style="padding:6px 12px; background:var(--bg-input); border-radius:6px; font-size:0.9rem; border:1px solid var(--border-color);">${soft}</li>`).join('')}
            </ul>
          </div>

          <div id="detail-tab-mentor" class="detail-tab-pane">
            <div class="sidebar-mentor-info" style="margin-top:0; padding:24px;">
              <img src="${mentorPic}" alt="${mentor.name}">
              <div>
                <h4>${mentor.name}</h4>
                <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:8px;">${mentor.company}</p>
                <span class="badge badge-cse">${mentor.specialties}</span>
              </div>
            </div>
            <p style="color:var(--text-secondary); margin-top:20px; font-size:0.95rem;">Book a session with ${mentor.name} for hardware debugging or thesis modification guidelines.</p>
          </div>

          <div id="detail-tab-faq" class="detail-tab-pane">
            ${p.faqs.map(faq => `
              <div class="faq-item">
                <div class="faq-question" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                  <span>${faq.q}</span>
                  <i class="fa-solid fa-chevron-down"></i>
                </div>
                <div class="faq-answer" style="display:none;">${faq.a}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <aside class="purchase-sidebar glass-panel">
          <div style="font-size:2.25rem; font-weight:800; color:var(--color-primary); font-family:var(--font-header);">₹${p.price.toLocaleString()}</div>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-top:-10px;"><i class="fa-solid fa-circle-check"></i> Standard GST Inclusive Price</p>
          
          <button class="btn-primary" style="justify-content:center; padding:14px; font-size:1.05rem;" onclick="app.cart.add('project', '${p.id}')">
            <i class="fa-solid fa-shopping-cart"></i> Buy Project
          </button>
          
          <button class="btn-secondary" style="justify-content:center;" onclick="app.projects.openCustomization('${p.id}')">
            <i class="fa-solid fa-sliders"></i> Customize Project
          </button>

          <button class="btn-secondary" style="justify-content:center;" onclick="app.mentors.openBookingModal('${mentor.id}')">
            <i class="fa-solid fa-calendar-alt"></i> Book Mentor Session
          </button>

          <a class="btn-secondary" style="justify-content:center; text-align:center;" href="#" onclick="alert('Brochure generated successfully!'); return false;">
            <i class="fa-solid fa-file-pdf"></i> Download Brochure
          </a>
        </aside>
      </div>
    `;
  },

  switchTab: function(tabId, btn) {
    this.activeTab = tabId;
    btn.parentElement.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const view = btn.closest('.project-detail-layout');
    view.querySelectorAll('.detail-tab-pane').forEach(p => p.classList.remove('active'));
    view.querySelector('#detail-tab-' + tabId).classList.add('active');
  },

  playVideoMock: function(btn) {
    const container = btn.parentElement;
    container.innerHTML = `
      <iframe width="100%" height="100%" src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1" title="Demo Video Player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    `;
  },

  openCustomization: function(projId) {
    if (!app.db.currentUser) {
      app.toast.show('Please log in to submit customization request!', 'error');
      app.router.navigate('auth');
      return;
    }
    document.getElementById('customize-project-id').value = projId;
    app.modal.open('customize');
  },

  submitCustomization: function() {
    const id = document.getElementById('customize-project-id').value;
    const details = document.getElementById('customize-description').value;
    if (!details) {
      app.toast.show('Please enter details of customization required.', 'error');
      return;
    }
    app.toast.show('Customization request submitted! Mentor will email quotes shortly.', 'success');
    app.modal.close('customize');
    document.getElementById('customize-description').value = '';
  }
};


// --- MENTORSHIP MODULE ---
app.mentors = {
  renderList: function() {
    const container = document.getElementById('mentors-list-container');
    if (!container) return;

    container.innerHTML = app.db.mentors.map(m => {
      const pic = app.db.getMentorPic(m.picPath);
      return `
        <div class="mentor-card glass-panel">
          <div class="mentor-avatar-wrap">
            <img src="${pic}" alt="${m.name}">
          </div>
          <h3>${m.name}</h3>
          <p style="color:var(--text-primary); font-weight:600; font-size:0.85rem; margin-bottom:4px;">${m.company}</p>
          <p class="mentor-specialties">${m.specialties}</p>
          <div class="rating-stars" style="margin-bottom:16px;">
            <i class="fa-solid fa-star"></i> ${m.rating} | Fee: ₹${m.bookingsFee}/hr
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <button class="btn-primary" style="padding:8px 12px; font-size:0.8rem; justify-content:center;" onclick="app.mentors.openBookingModal('${m.id}')">Book 1:1</button>
            <button class="btn-secondary" style="padding:8px 12px; font-size:0.8rem; justify-content:center;" onclick="app.chat.openChatWindow('${m.id}')">Chat</button>
          </div>
        </div>
      `;
    }).join('');
  },

  openBookingModal: function(mentorId) {
    if (!app.db.currentUser) {
      app.toast.show('Please log in to book a mentorship session!', 'error');
      app.router.navigate('auth');
      return;
    }
    const m = app.db.mentors.find(x => x.id === mentorId);
    if (!m) return;

    sessionStorage.setItem('temp_booking_mentor_id', mentorId);

    const summary = document.getElementById('booking-mentor-summary');
    const pic = app.db.getMentorPic(m.picPath);
    summary.innerHTML = `
      <img src="${pic}" alt="${m.name}" style="width:40px; height:40px; border-radius:50%;">
      <div>
        <h4 style="font-size:0.95rem;">${m.name}</h4>
        <p style="font-size:0.8rem; color:var(--text-muted);">Hourly Fee: ₹${m.bookingsFee}</p>
      </div>
    `;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('book-session-date').value = tomorrow.toISOString().split('T')[0];

    app.modal.open('booking');
  },

  confirmBooking: function() {
    const mentorId = sessionStorage.getItem('temp_booking_mentor_id');
    const m = app.db.mentors.find(x => x.id === mentorId);
    if (!m) return;

    const date = document.getElementById('book-session-date').value;
    const time = document.getElementById('book-session-time').value;
    const type = document.getElementById('book-session-type').value;

    if (!date) {
      app.toast.show('Please pick a date!', 'error');
      return;
    }

    app.cart.add('mentorship', m.id, { date, time, type });
    app.modal.close('booking');
    app.router.navigate('cart');
  }
};


// --- ELECTRONICS COMPONENTS STORE ---
app.store = {
  activeCategory: 'All',

  renderList: function() {
    const categories = ['All', 'Arduino', 'ESP32', 'Raspberry Pi', 'Sensors', 'LCD', 'Relay', 'Motors', 'Robotics Kits'];
    const container = document.getElementById('store-categories-list');
    if (container) {
      container.innerHTML = categories.map(c => `
        <label class="filter-option" style="padding:6px; cursor:pointer;">
          <input type="radio" name="store-cat" value="${c}" ${c === this.activeCategory ? 'checked' : ''} onchange="app.store.selectCategory('${c}')"> ${c}
        </label>
      `).join('');
    }

    this.applyFilters();
  },

  selectCategory: function(cat) {
    this.activeCategory = cat;
    this.applyFilters();
  },

  applyFilters: function() {
    const searchVal = document.getElementById('store-search-input').value.toLowerCase();
    
    let filtered = app.db.components.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchVal) || p.specs.toLowerCase().includes(searchVal);
      const matchesCat = this.activeCategory === 'All' || p.category === this.activeCategory;
      return matchesSearch && matchesCat;
    });

    const container = document.getElementById('store-products-container');
    if (container) {
      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No products found.</div>';
      } else {
        container.innerHTML = filtered.map(item => `
          <div class="project-card glass-panel product-card">
            <div class="project-img-wrapper" style="height:150px;">
              <img src="https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&w=360&q=80" alt="${item.name}">
              <span class="badge badge-ece" style="position:absolute; top:12px; left:12px;">${item.category}</span>
            </div>
            <div class="project-info" style="padding:16px;">
              <h3 style="font-size:1.1rem; margin-bottom:6px;">${item.name}</h3>
              <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">Specs: ${item.specs}</p>
              <div style="font-size:0.8rem; font-weight:600; color: ${item.stock > 5 ? 'var(--color-success)' : 'var(--color-danger)'};">
                Status: ${item.stock > 0 ? `In Stock (${item.stock})` : 'Out of Stock'}
              </div>
              <div class="product-price-bar">
                <span>₹${item.price.toLocaleString()}</span>
                <button class="btn-primary" style="padding: 6px 12px; font-size:0.8rem;" onclick="app.cart.add('component', '${item.id}')" ${item.stock === 0 ? 'disabled' : ''}>
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }
  }
};


// --- SHOPPING CART & CHECKOUT ---
app.cart = {
  couponApplied: null,

  init: function() {
    const saved = localStorage.getItem('nest_cart');
    app.db.cart = saved ? JSON.parse(saved) : [];
    this.updateHeaderCounter();
  },

  save: function() {
    localStorage.setItem('nest_cart', JSON.stringify(app.db.cart));
    this.updateHeaderCounter();
  },

  updateHeaderCounter: function() {
    const counts = app.db.cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById('header-cart-count');
    if (badge) badge.innerText = counts;
  },

  add: function(type, itemId, options = {}) {
    let matchedItem = null;
    let name = '';
    let price = 0;

    if (type === 'project') {
      const p = app.db.projects.find(x => x.id === itemId);
      if (p) { name = p.title; price = p.price; matchedItem = p; }
    } else if (type === 'component') {
      const c = app.db.components.find(x => x.id === itemId);
      if (c) { name = c.name; price = c.price; matchedItem = c; }
    } else if (type === 'mentorship') {
      const m = app.db.mentors.find(x => x.id === itemId);
      if (m) { name = `1:1 Mentoring Session - ${m.name}`; price = m.bookingsFee; matchedItem = m; }
    }

    if (!matchedItem) return;

    const existing = app.db.cart.find(x => x.id === itemId && x.type === type);
    if (existing && type === 'component') {
      existing.qty += 1;
    } else if (existing) {
      app.toast.show('Item already in your cart!', 'info');
      return;
    } else {
      app.db.cart.push({ id: itemId, name, price, type, qty: 1, options });
    }

    this.save();
    app.toast.show(`Added to Cart`, 'success');
  },

  remove: function(index) {
    app.db.cart.splice(index, 1);
    this.save();
    this.renderPage();
  },

  updateQty: function(index, delta) {
    const item = app.db.cart[index];
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) this.remove(index);
    else { this.save(); this.renderPage(); }
  },

  renderPage: function() {
    const container = document.getElementById('cart-content-wrapper');
    if (!container) return;

    if (app.db.cart.length === 0) {
      container.innerHTML = `
        <div class="glass-panel" style="padding:60px; text-align:center; color:var(--text-muted);">
          <i class="fa-solid fa-shopping-basket" style="font-size:3rem; margin-bottom:20px;"></i>
          <h3>Your cart is empty!</h3>
          <button class="btn-primary" style="margin-top:20px;" onclick="app.router.navigate('projects')">Browse Projects</button>
        </div>
      `;
      return;
    }

    const subtotal = app.db.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;

    container.innerHTML = `
      <div class="checkout-grid">
        <div class="glass-panel" style="padding:30px; display:flex; flex-direction:column; gap:16px;">
          ${app.db.cart.map((item, idx) => `
            <div class="cart-item-row" style="padding:16px; background:var(--bg-input); border-radius:8px;">
              <div class="cart-item-details">
                <h4 style="font-size:1.05rem; margin-bottom:4px;">${item.name}</h4>
                <p style="font-size:0.85rem; color:var(--text-muted); text-transform:capitalize;">Type: ${item.type} ${item.options.time ? `(${item.options.date} | ${item.options.time})` : ''}</p>
              </div>
              <div style="display:flex; align-items:center; gap:20px;">
                <div style="font-weight:700;">₹${(item.price * item.qty).toLocaleString()}</div>
                ${item.type === 'component' ? `
                  <div style="display:flex; align-items:center; gap:8px;">
                    <button class="btn-toggle-theme" style="width:28px; height:28px;" onclick="app.cart.updateQty(${idx}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button class="btn-toggle-theme" style="width:28px; height:28px;" onclick="app.cart.updateQty(${idx}, 1)">+</button>
                  </div>
                ` : ''}
                <button class="btn-icon-nav" style="border-color:transparent; color:var(--color-danger);" onclick="app.cart.remove(${idx})">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="glass-panel" style="padding:30px; height:fit-content; display:flex; flex-direction:column; gap:20px;">
          <h3 style="border-bottom:1px solid var(--border-color); padding-bottom:10px;">Cart Summary</h3>
          <div class="flex-space">
            <span>Subtotal</span>
            <span>₹${subtotal.toLocaleString()}</span>
          </div>
          <div class="flex-space">
            <span>GST (18%)</span>
            <span>₹${gst.toLocaleString()}</span>
          </div>
          <div class="flex-space" style="font-size:1.25rem; font-weight:700; border-top:1px solid var(--border-color); padding-top:16px;">
            <span>Est. Total</span>
            <span>₹${total.toLocaleString()}</span>
          </div>
          <button class="btn-primary" style="justify-content:center; padding:14px;" onclick="app.router.navigate('checkout')">
            Proceed to Checkout
          </button>
        </div>
      </div>
    `;
  },

  renderCheckout: function() {
    if (!app.db.currentUser) {
      app.toast.show('Please log in to complete checkout!', 'error');
      app.router.navigate('auth');
      return;
    }

    const subtotal = app.db.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const disc = this.couponApplied ? Math.round(subtotal * 0.10) : 0;
    const gst = Math.round((subtotal - disc) * 0.18);
    const total = subtotal - disc + gst;

    document.getElementById('checkout-subtotal').innerText = `₹${subtotal.toLocaleString()}`;
    document.getElementById('checkout-discount').innerText = `-₹${disc.toLocaleString()}`;
    document.getElementById('checkout-gst-amount').innerText = `₹${gst.toLocaleString()}`;
    document.getElementById('checkout-total').innerText = `₹${total.toLocaleString()}`;

    const list = document.getElementById('checkout-summary-items');
    if (list) {
      list.innerHTML = app.db.cart.map(item => `
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:10px; color:var(--text-secondary);">
          <span>${item.name.substring(0, 30)}... (x${item.qty})</span>
          <span>₹${(item.price * item.qty).toLocaleString()}</span>
        </div>
      `).join('');
    }
  },

  applyCoupon: function() {
    const code = document.getElementById('checkout-coupon').value.trim().toUpperCase();
      if (code === 'PROJECT10') {
      this.couponApplied = 'PROJECT10';
      app.toast.show('10% Coupon code applied successfully!', 'success');
      this.renderCheckout();
    } else {
      app.toast.show('Invalid coupon code!', 'error');
    }
  },

  processCheckout: async function() {
    if (app.db.cart.length === 0) return;
    
    const subtotal = app.db.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const disc = this.couponApplied ? Math.round(subtotal * 0.10) : 0;
    const gst = Math.round((subtotal - disc) * 0.18);
    const total = subtotal - disc + gst;
    const gstInput = document.getElementById('checkout-gst');
    const gstNumber = gstInput ? gstInput.value : 'N/A';
    const method = document.querySelector('input[name="payment-method"]:checked').value;

    const checkoutData = {
      subtotal,
      discount: disc,
      gst,
      totalPrice: total,
      gstNumber,
      paymentMethod: method,
      email: app.db.currentUser.email,
      items: app.db.cart
    };

    // Trigger Interactive Secure Payment Simulator Modal
    app.payment.openGateway(checkoutData);
  }
};

// --- SECURE PAYMENT GATEWAY SIMULATOR ---
app.payment = {
  activeTab: 'upi',
  checkoutData: null,
  otpCode: null,
  selectedBank: null,

  openGateway: function(data) {
    this.checkoutData = data;
    this.activeTab = 'upi';
    this.selectedBank = null;
    this.otpCode = null;

    // Display order amount
    document.getElementById('pay-gateway-total').innerText = `₹${data.totalPrice.toLocaleString()}`;

    // Reset view states
    document.getElementById('pay-gateway-forms').style.display = 'block';
    document.getElementById('pay-gateway-otp-screen').style.display = 'none';
    document.getElementById('pay-gateway-loading-screen').style.display = 'none';

    // Reset form field values
    document.getElementById('pay-upi-id').value = '';
    document.getElementById('pay-card-name').value = '';
    document.getElementById('pay-card-number').value = '';
    document.getElementById('pay-card-expiry').value = '';
    document.getElementById('pay-card-cvv').value = '';
    document.getElementById('pay-nb-select').value = '';
    document.querySelectorAll('.nb-bank-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.otp-digit').forEach(input => input.value = '');

    // Display initial tab
    this.switchTab('upi');

    // Load custom Admin payment settings if configured
    const adminSettings = localStorage.getItem('admin_bank_settings');
    let recipientUPI = 'projectnest@upi';
    if (adminSettings) {
      try {
        const parsed = JSON.parse(adminSettings);
        if (parsed.upiId) {
          recipientUPI = parsed.upiId;
        }
      } catch (e) {}
    }
    const upiElement = document.getElementById('pay-gateway-upi-recipient');
    if (upiElement) {
      upiElement.innerText = `Recipient: ${recipientUPI}`;
    }

    // Trigger visual components refresh
    this.updateCardPreview();

    // Launch overlay
    app.modal.open('payment-gateway');
  },

  switchTab: function(tabId) {
    this.activeTab = tabId;
    
    // Manage tab selectors
    document.querySelectorAll('#pay-gateway-tabs .payment-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    // Display target forms pane
    document.querySelectorAll('#pay-gateway-body .payment-pane').forEach(pane => {
      pane.classList.toggle('active', pane.getAttribute('id') === `pay-pane-${tabId}`);
    });
  },

  updateCardPreview: function() {
    const name = document.getElementById('pay-card-name').value || 'YOUR NAME';
    let number = document.getElementById('pay-card-number').value || '•••• •••• •••• ••••';
    const expiry = document.getElementById('pay-card-expiry').value || 'MM/YY';
    const cvv = document.getElementById('pay-card-cvv').value || '•••';

    // Auto card spacing formatter
    let rawNumber = number.replace(/\D/g, '');
    let formattedNumber = '';
    for (let i = 0; i < rawNumber.length; i++) {
      if (i > 0 && i % 4 === 0) formattedNumber += ' ';
      formattedNumber += rawNumber[i];
    }
    document.getElementById('pay-card-number').value = formattedNumber;
    document.getElementById('card-preview-number').innerText = formattedNumber || '•••• •••• •••• ••••';

    // Expiry date formatter (MM/YY)
    let rawExpiry = expiry.replace(/\D/g, '');
    let formattedExpiry = '';
    if (rawExpiry.length > 2) {
      formattedExpiry = rawExpiry.substring(0, 2) + '/' + rawExpiry.substring(2, 4);
    } else {
      formattedExpiry = rawExpiry;
    }
    document.getElementById('pay-card-expiry').value = formattedExpiry;
    document.getElementById('card-preview-expiry').innerText = formattedExpiry || 'MM/YY';

    document.getElementById('card-preview-name').innerText = name.toUpperCase() || 'YOUR NAME';
    document.getElementById('card-preview-cvv').innerText = cvv;

    // Simple Card Brand Identification logic
    let brand = 'VISA';
    if (rawNumber.startsWith('5')) {
      brand = 'MASTERCARD';
    } else if (rawNumber.startsWith('6')) {
      brand = 'RUPAY';
    } else if (rawNumber.startsWith('3')) {
      brand = 'AMEX';
    }
    document.getElementById('card-preview-brand').innerText = brand;
  },

  flipCard: function(isFlipped) {
    const cardInner = document.getElementById('card-preview-inner');
    if (cardInner) {
      cardInner.classList.toggle('flipped', isFlipped);
    }
  },

  selectBank: function(bankId, element) {
    this.selectedBank = bankId;
    document.querySelectorAll('.nb-bank-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('pay-nb-select').value = '';
  },

  submitUPI: function() {
    const upiId = document.getElementById('pay-upi-id').value.trim();
    if (!upiId) {
      // Allow simulator to continue via QR code option
      this.triggerLoading("Initiating QR Code Scan Verification...");
      return;
    }

    if (!upiId.includes('@')) {
      app.toast.show('Please input a valid UPI ID (e.g. user@bank)', 'error');
      return;
    }

    this.triggerLoading(`Sending UPI transaction request to ${upiId}...`);
  },

  submitNetbanking: function() {
    const customBank = document.getElementById('pay-nb-select').value;
    const bank = this.selectedBank || customBank;

    if (!bank) {
      app.toast.show('Please select a bank to process payment', 'error');
      return;
    }

    this.triggerLoading(`Redirecting to ${bank} Secure Netbanking Terminal...`);
  },

  submitCard: function() {
    const name = document.getElementById('pay-card-name').value.trim();
    const number = document.getElementById('pay-card-number').value.replace(/\s+/g, '');
    const expiry = document.getElementById('pay-card-expiry').value;
    const cvv = document.getElementById('pay-card-cvv').value;

    if (!name || number.length < 16 || expiry.length < 5 || cvv.length < 3) {
      app.toast.show('Please fill in card details correctly', 'error');
      return;
    }

    // Generate secure sandbox verification OTP
    this.otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Switch views to OTP validation
    document.getElementById('pay-gateway-forms').style.display = 'none';
    document.getElementById('pay-gateway-otp-screen').style.display = 'block';

    setTimeout(() => {
      app.toast.show(`[SIMULATOR] Secure 2FA OTP Code: ${this.otpCode}`, 'info');
    }, 800);
  },

  otpMove: function(input, event) {
    if (input.value.length === 1 && input.nextElementSibling) {
      input.nextElementSibling.focus();
    }
    if (event.key === 'Backspace' && input.previousElementSibling) {
      input.previousElementSibling.focus();
    }
  },

  verifyOTP: function() {
    const inputs = document.querySelectorAll('.otp-digit');
    let code = '';
    inputs.forEach(input => code += input.value.trim());

    if (code !== this.otpCode) {
      app.toast.show('Incorrect verification code. Please check and retry.', 'error');
      return;
    }

    // Advance verification
    document.getElementById('pay-gateway-otp-screen').style.display = 'none';
    this.triggerLoading("OTP Validated! Processing Secure Order...");
  },

  triggerLoading: function(statusTitle) {
    document.getElementById('pay-gateway-forms').style.display = 'none';
    document.getElementById('pay-gateway-otp-screen').style.display = 'none';
    
    const loadingScreen = document.getElementById('pay-gateway-loading-screen');
    loadingScreen.style.display = 'block';

    document.getElementById('pay-gateway-spinner').style.display = 'block';
    document.getElementById('pay-gateway-tick').style.display = 'none';
    document.getElementById('pay-gateway-loader-title').innerText = statusTitle;
    document.getElementById('pay-gateway-loader-desc').innerText = "Securing transaction tunnel. Please do not close this window.";

    const self = this;
    setTimeout(() => {
      document.getElementById('pay-gateway-loader-title').innerText = "Authorizing Fund Clearance...";
      
      setTimeout(() => {
        document.getElementById('pay-gateway-spinner').style.display = 'none';
        document.getElementById('pay-gateway-tick').style.display = 'block';
        document.getElementById('pay-gateway-loader-title').innerText = "Payment Successful!";
        document.getElementById('pay-gateway-loader-desc').innerText = "Clearing funds and writing receipt to database...";

        setTimeout(async () => {
          app.modal.close('payment-gateway');
          await self.executeFinalCheckout();
        }, 1500);

      }, 1500);
    }, 1500);
  },

  executeFinalCheckout: async function() {
    const checkoutData = this.checkoutData;
    if (!checkoutData) return;

    try {
      const response = await fetch(app.API_URL + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutData)
      });
      
      const resData = await response.json();
      if (!response.ok) {
        app.toast.show(resData.error || 'Checkout process failed', 'error');
        return;
      }

      // Add appointments separately
      for (const item of app.db.cart) {
        if (item.type === 'mentorship') {
          await fetch(app.API_URL + '/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mentorName: item.name.replace('1:1 Mentoring Session - ', ''),
              date: item.options.date,
              time: item.options.time,
              type: item.options.type,
              studentEmail: app.db.currentUser.email
            })
          });
        }
      }

      // Clear local cart database
      app.db.cart = [];
      app.cart.couponApplied = null;
      app.cart.save();
      app.toast.show('Payment Confirmed! Invoices generated.', 'success');

      // Generate invoice bill layout
      const mainPane = document.getElementById('view-checkout');
      mainPane.innerHTML = `
        <div class="glass-panel" style="padding:40px; max-width:800px; margin:0 auto; text-align:center;">
          <i class="fa-solid fa-circle-check" style="font-size:4rem; color:var(--color-success); margin-bottom:20px;"></i>
          <h2>Thank You for Your Order!</h2>
          <p style="color:var(--text-secondary); margin-bottom:30px;">Your transaction was completed successfully.</p>
          
          <button class="btn-primary" onclick="window.print()" style="margin-bottom:30px;"><i class="fa-solid fa-print"></i> Print GST Bill / Invoice</button>
          <button class="btn-secondary" onclick="app.router.navigate('dashboard')" style="margin-bottom:30px; margin-left:12px;">Go to My Dashboard</button>

          <div class="invoice-card" style="text-align:left; background:#fff; padding:30px; color:#333; border-radius:8px;">
            <div class="invoice-header" style="display:flex; justify-content:space-between; margin-bottom:30px;">
              <div>
                <div class="invoice-logo" style="font-size:1.5rem; font-weight:800;">ProjectNest Hub</div>
                <p style="font-size:0.8rem; color:#666;">24, Innovation Park, Delhi, IN</p>
              </div>
              <div style="text-align:right;">
                <h2 style="color:#111; font-size:1.5rem; margin-bottom:6px;">INVOICE</h2>
                <p style="font-size:0.85rem;"><b>ID:</b> ${resData.orderId}</p>
                <p style="font-size:0.85rem;"><b>Date:</b> ${new Date().toISOString().split('T')[0]}</p>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; font-size:0.85rem; margin-bottom:30px; color:#333;">
              <div>
                <h4 style="color:#111; font-size:0.95rem; margin-bottom:6px;">Billed To:</h4>
                <p>${checkoutData.email}</p>
                <!-- <p>GSTIN: ${checkoutData.gstNumber}</p> -->
              </div>
              <div style="text-align:right;">
                <h4 style="color:#111; font-size:0.95rem; margin-bottom:6px;">Payment Summary:</h4>
                <p>Payment Mode: ${checkoutData.paymentMethod.toUpperCase()}</p>
                <p>Status: <span style="color:var(--color-success); font-weight:700;">PAID</span></p>
              </div>
            </div>

            <table class="invoice-table" style="width:100%; border-collapse:collapse; margin-bottom:30px; font-size:0.85rem; color:#333;">
              <thead>
                <tr style="border-bottom:2px solid #ddd; text-align:left; font-weight:700;">
                  <th style="padding:10px 0;">Item Description</th>
                  <th style="padding:10px 0; text-align:center;">Qty</th>
                  <th style="padding:10px 0; text-align:right;">Unit Price</th>
                  <th style="padding:10px 0; text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${checkoutData.items.map(item => `
                  <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px 0;">${item.name} <span style="font-size:0.75rem; color:#666; display:block;">Type: ${item.type}</span></td>
                    <td style="padding:10px 0; text-align:center;">${item.qty}</td>
                    <td style="padding:10px 0; text-align:right;">₹${item.price.toLocaleString()}</td>
                    <td style="padding:10px 0; text-align:right;">₹${(item.price * item.qty).toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div style="width:100%; display:flex; justify-content:flex-end;">
              <div style="width:300px; display:flex; flex-direction:column; gap:8px; font-size:0.85rem; color:#333;">
                <div class="flex-space">
                  <span>Subtotal</span>
                  <span>₹${checkoutData.subtotal.toLocaleString()}</span>
                </div>
                ${checkoutData.discount > 0 ? `
                  <div class="flex-space" style="color:var(--color-danger);">
                    <span>Discount (10%)</span>
                    <span>-₹${checkoutData.discount.toLocaleString()}</span>
                  </div>
                ` : ''}
                <div class="flex-space">
                  <span>GST (18%)</span>
                  <span>₹${checkoutData.gst.toLocaleString()}</span>
                </div>
                <div class="flex-space" style="font-size:1.1rem; font-weight:700; border-top:2px solid #333; padding-top:8px; color:#111;">
                  <span>Grand Total</span>
                  <span>₹${checkoutData.totalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div style="text-align:center; border-top:1px dashed #ccc; padding-top:20px; margin-top:40px; font-size:0.75rem; color:#999;">
              This is a computer-generated receipt and requires no signature.
            </div>
          </div>
        </div>
      `;

      // Update sidebar view / scroll to top
      window.scrollTo(0, 0);

    } catch (err) {
      console.error(err);
      app.toast.show('Checkout process encountered a network error!', 'error');
    }
  }
};


// --- DISCUSSION FORUM MODULE ---
app.forum = {
  activeBranch: 'All',

  render: function() {
    const list = document.getElementById('forum-branches-list');
    if (list) {
      const branches = ['All', 'ECE', 'CSE', 'Civil', 'Mech', 'EE'];
      list.innerHTML = branches.map(b => `
        <label class="filter-option" style="padding:6px; cursor:pointer;">
          <input type="radio" name="forum-cat" value="${b}" ${b === this.activeBranch ? 'checked' : ''} onchange="app.forum.selectCategory('${b}')"> ${b} Engineering
        </label>
      `).join('');
    }

    this.renderThreads();
  },

  selectCategory: function(b) {
    this.activeBranch = b;
    this.renderThreads();
  },

  renderThreads: function() {
    const searchVal = document.getElementById('forum-search-input').value.toLowerCase();
    
    let filtered = app.db.forumThreads.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchVal) || t.content.toLowerCase().includes(searchVal);
      const matchesCat = this.activeBranch === 'All' || t.category === this.activeBranch;
      return matchesSearch && matchesCat;
    });

    const container = document.getElementById('forum-threads-container');
    if (container) {
      if (filtered.length === 0) {
        container.innerHTML = '<div class="glass-panel" style="padding:40px; text-align:center; color:var(--text-muted);">No threads found. Start a new topic!</div>';
      } else {
        container.innerHTML = filtered.map(t => `
          <div class="forum-thread-card glass-panel" onclick="app.forum.viewThread('${t.id}')">
            <h3 style="font-size:1.15rem; margin-bottom:8px; cursor:pointer;"><span class="badge badge-${t.category.toLowerCase()}" style="margin-right:8px;">${t.category}</span> ${t.title}</h3>
            <p style="font-size:0.9rem; color:var(--text-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${t.content}</p>
            <div class="thread-meta">
              <span><i class="fa-solid fa-user"></i> ${t.author}</span>
              <span><i class="fa-solid fa-comment"></i> ${t.replies.length} replies</span>
              <span><i class="fa-solid fa-thumbs-up" style="color:var(--color-primary);"></i> ${t.likes} likes</span>
              <span><i class="fa-solid fa-calendar"></i> ${t.date}</span>
            </div>
          </div>
        `).join('');
      }
    }
  },

  openNewPostModal: function() {
    if (!app.db.currentUser) {
      app.toast.show('Please log in to post topics in the forum!', 'error');
      app.router.navigate('auth');
      return;
    }
    app.modal.open('newpost');
  },

  submitNewPost: async function() {
    const title = document.getElementById('forum-new-title').value.trim();
    const cat = document.getElementById('forum-new-category').value;
    const content = document.getElementById('forum-new-content').value.trim();

    if (!title || !content) {
      app.toast.show('Please fill in title and discussion content.', 'error');
      return;
    }

    try {
      const response = await fetch(app.API_URL + '/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, category: cat, content, author: app.db.currentUser.email
        })
      });
      
      if (!response.ok) {
        app.toast.show('Forum post submission failed', 'error');
        return;
      }

      app.toast.show('Thread created successfully!', 'success');
      app.modal.close('newpost');
      
      document.getElementById('forum-new-title').value = '';
      document.getElementById('forum-new-content').value = '';
      
      await app.db.load();
      this.renderThreads();
    } catch (err) {
      app.toast.show('Failed saving thread topic on server', 'error');
    }
  },

  viewThread: function(threadId) {
    const t = app.db.forumThreads.find(x => x.id === threadId);
    if (!t) return;

    const container = document.getElementById('forum-threads-container');
    if (!container) return;

    container.innerHTML = `
      <button class="btn-secondary" style="margin-bottom:20px;" onclick="app.forum.renderThreads()"><i class="fa-solid fa-arrow-left"></i> Back to Forum</button>
      
      <div class="glass-panel" style="padding:30px; margin-bottom:24px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <span class="badge badge-${t.category.toLowerCase()}">${t.category} Domain</span>
          <span style="font-size:0.85rem; color:var(--text-muted);">${t.date}</span>
        </div>
        <h2 style="margin-bottom:16px;">${t.title}</h2>
        <p style="color:var(--text-secondary); white-space:pre-wrap; margin-bottom:20px;">${t.content}</p>
        <div style="display:flex; gap:16px; font-size:0.85rem; color:var(--text-muted);">
          <span>By: <b>${t.author}</b></span>
          <button style="background:transparent; border:none; cursor:pointer;" onclick="app.forum.likeThread('${t.id}')">
            <i class="fa-solid fa-thumbs-up" style="color:var(--color-primary); margin-right:4px;"></i> ${t.likes} Likes
          </button>
        </div>
      </div>

      <h3 style="margin-bottom:16px;">Replies (${t.replies.length})</h3>
      <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:30px;">
        ${t.replies.map(r => `
          <div class="glass-panel" style="padding:20px; margin-left:20px; background:rgba(255,255,255,0.02);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.8rem; color:var(--text-muted);">
              <b>${r.author}</b>
            </div>
            <p style="color:var(--text-secondary);">${r.content}</p>
          </div>
        `).join('')}
      </div>

      <div class="glass-panel" style="padding:24px;">
        <h4 style="margin-bottom:12px;">Post a Reply</h4>
        <textarea id="forum-reply-input" style="width:100%; height:100px; background:var(--bg-input); border:1px solid var(--border-color); padding:12px; border-radius:8px; margin-bottom:16px;" placeholder="Type your answer, troubleshooting tips..."></textarea>
        <button class="btn-primary" onclick="app.forum.submitReply('${t.id}')">Submit Reply</button>
      </div>
    `;
  },

  likeThread: async function(id) {
    try {
      await fetch(app.API_URL + `/forum/${id}/like`, { method: 'POST' });
      await app.db.load();
      this.viewThread(id);
    } catch (err) {
      console.error(err);
    }
  },

  submitReply: async function(threadId) {
    if (!app.db.currentUser) {
      app.toast.show('Please log in to submit a reply!', 'error');
      app.router.navigate('auth');
      return;
    }

    const val = document.getElementById('forum-reply-input').value.trim();
    if (!val) {
      app.toast.show('Reply message cannot be empty!', 'error');
      return;
    }

    try {
      const response = await fetch(app.API_URL + `/forum/${threadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: app.db.currentUser.email,
          content: val
        })
      });
      if (!response.ok) return;

      app.toast.show('Reply posted successfully.', 'success');
      await app.db.load();
      this.viewThread(threadId);
    } catch (err) {
      console.error(err);
    }
  }
};


// --- RESUME BUILDER MODULE ---
app.resume = {
  init: function() {
    this.updatePreview();
  },

  updatePreview: function() {
    const name = document.getElementById('res-name').value || 'Your Full Name';
    const branch = document.getElementById('res-branch').value || 'B.Tech ECE, Semester 6';
    const contact = document.getElementById('res-contact').value || 'name@domain.com | +91 9988776655';
    const skills = document.getElementById('res-skills').value || 'Technical Skills List...';
    const projects = document.getElementById('res-projects').value || 'Academic Project Descriptions...';
    const edu = document.getElementById('res-edu').value || 'University Name & CGPA details';

    const preview = document.getElementById('resume-preview-container');
    if (preview) {
      preview.innerHTML = `
        <div style="border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; text-align: center;">
          <h2 style="font-size: 2rem; color: #111; margin-bottom:4px;">${name}</h2>
          <p style="color: #666; font-size: 0.9rem; font-weight:500;">${branch}</p>
          <p style="color: #666; font-size: 0.85rem;">${contact}</p>
        </div>
        <div style="margin-bottom: 20px;">
          <h3 style="border-bottom: 1px solid #ddd; color: #1e3a8a; font-size: 1.1rem; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase;">Technical Skills</h3>
          <p style="font-size: 0.9rem; color: #333; white-space: pre-line;">${skills}</p>
        </div>
        <div style="margin-bottom: 20px;">
          <h3 style="border-bottom: 1px solid #ddd; color: #1e3a8a; font-size: 1.1rem; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase;">Academic Projects</h3>
          <p style="font-size: 0.9rem; color: #333; white-space: pre-line;">${projects}</p>
        </div>
        <div style="margin-bottom: 20px;">
          <h3 style="border-bottom: 1px solid #ddd; color: #1e3a8a; font-size: 1.1rem; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase;">Education</h3>
          <p style="font-size: 0.9rem; color: #333; white-space: pre-line;">${edu}</p>
        </div>
      `;
    }
  }
};


// --- STUDENT DASHBOARD VIEW ---
app.dashboard = {
  activeTab: 'profile',

  render: function() {
    if (!app.db.currentUser) {
      app.router.navigate('auth');
      return;
    }
    this.switchTab(this.activeTab);
  },

  switchTab: function(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.dash-nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById('dash-btn-' + tabId);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.dashboard-content-pane').forEach(p => p.classList.remove('active'));
    const targetPane = document.getElementById('dash-pane-' + tabId);
    if (targetPane) targetPane.classList.add('active');

    this.renderTabContent(tabId);
  },

  renderTabContent: function(tabId) {
    const user = app.db.currentUser;

    if (tabId === 'profile') {
      const grid = document.getElementById('dash-profile-info-grid');
      grid.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; font-size:0.95rem; margin-bottom:30px;">
          <div><p style="color:var(--text-muted);">Full Name:</p><b>${user.name}</b></div>
          <div><p style="color:var(--text-muted);">Email Address:</p><b>${user.email}</b></div>
          <div><p style="color:var(--text-muted);">Mobile Number:</p><b>${user.mobile}</b></div>
          <div><p style="color:var(--text-muted);">College / University:</p><b>${user.college} (${user.uni})</b></div>
          <div><p style="color:var(--text-muted);">Engineering Branch:</p><b>${user.branch}</b></div>
          <div><p style="color:var(--text-muted);">Active Semester:</p><b>Semester ${user.semester}</b></div>
        </div>
      `;
    } 
    
    else if (tabId === 'projects') {
      const container = document.getElementById('dash-projects-container');
      const purchased = user.purchasedProjects || [];

      if (purchased.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">You have not purchased any projects yet.</p>';
      } else {
        container.innerHTML = purchased.map((p, idx) => {
          const step = p.progressStep || 1;
          const pct = ((step - 1) / 4) * 100;
          
          return `
            <div class="glass-panel" style="padding:24px; margin-bottom:20px; background:rgba(255,255,255,0.01);">
              <h4 style="font-size:1.1rem; margin-bottom:20px; color:var(--color-primary);">${p.title}</h4>
              
              <div class="progress-tracker">
                <div class="progress-bar-fill" style="width: ${pct}%;"></div>
                
                <div class="tracker-step ${step >= 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}" onclick="app.dashboard.updateProgress('${p.id}', 1)">
                  <div class="tracker-dot">1</div>
                  <div class="tracker-label">Ideation</div>
                </div>
                <div class="tracker-step ${step >= 2 ? 'completed' : ''} ${step === 2 ? 'active' : ''}" onclick="app.dashboard.updateProgress('${p.id}', 2)">
                  <div class="tracker-dot">2</div>
                  <div class="tracker-label">Procure</div>
                </div>
                <div class="tracker-step ${step >= 3 ? 'completed' : ''} ${step === 3 ? 'active' : ''}" onclick="app.dashboard.updateProgress('${p.id}', 3)">
                  <div class="tracker-dot">3</div>
                  <div class="tracker-label">Circuit</div>
                </div>
                <div class="tracker-step ${step >= 4 ? 'completed' : ''} ${step === 4 ? 'active' : ''}" onclick="app.dashboard.updateProgress('${p.id}', 4)">
                  <div class="tracker-dot">4</div>
                  <div class="tracker-label">Coding</div>
                </div>
                <div class="tracker-step ${step >= 5 ? 'completed' : ''} ${step === 5 ? 'active' : ''}" onclick="app.dashboard.updateProgress('${p.id}', 5)">
                  <div class="tracker-dot">5</div>
                  <div class="tracker-label">Testing</div>
                </div>
              </div>

              <h5 style="margin-bottom:10px;">Downloadable Attachments</h5>
              <div style="display:flex; gap:12px;">
                ${p.files.map(f => `
                  <button class="btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="app.toast.show('Downloading ${f}...','success')">
                    <i class="fa-solid fa-download"></i> ${f}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('');
      }
    } 
    
    else if (tabId === 'sessions') {
      const container = document.getElementById('dash-sessions-container');
      const sessions = app.db.appointments;

      if (sessions.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">No mentorship sessions booked yet.</p>';
      } else {
        container.innerHTML = sessions.map(s => `
          <div class="glass-panel flex-space" style="padding:20px; margin-bottom:16px; background:rgba(255,255,255,0.01);">
            <div>
              <h4 style="font-size:1.05rem; margin-bottom:4px;">1:1 consultation: ${s.mentorName}</h4>
              <p style="font-size:0.85rem; color:var(--text-secondary);"><i class="fa-solid fa-calendar"></i> ${s.date} | ${s.time} (${s.type})</p>
            </div>
            <div style="display:flex; gap:10px;">
              ${s.type === 'Online' ? `
                <button class="btn-primary" style="padding:8px 12px; font-size:0.8rem;" onclick="app.dashboard.joinMeetingSim('${s.id}')">Join Zoom</button>
              ` : ''}
              <button class="btn-secondary" style="padding:8px 12px; font-size:0.8rem;" onclick="app.dashboard.openUploadAssignment()">Upload report</button>
            </div>
          </div>
        `).join('');
      }
    } 
    
    else if (tabId === 'wishlist') {
      const container = document.getElementById('dash-wishlist-container');
      const wishlistItems = app.db.projects.filter(p => user.wishlist && user.wishlist.includes(p.id));

      if (wishlistItems.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; color:var(--text-muted);">Your wishlist is empty.</div>';
      } else {
        container.innerHTML = wishlistItems.map(p => app.projects.createCardHtml(p)).join('');
      }
    } 
    
    else if (tabId === 'history') {
      const container = document.getElementById('dash-history-container');
      const transactions = app.db.orders;

      if (transactions.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">No billing transactions found.</p>';
      } else {
        container.innerHTML = transactions.map(t => `
          <div class="glass-panel flex-space" style="padding:16px; margin-bottom:12px; background:rgba(255,255,255,0.01);">
            <div>
              <span style="font-weight:700; color:var(--color-primary);">${t.orderId}</span>
              <span style="font-size:0.8rem; color:var(--text-muted); margin-left:10px;">${t.date}</span>
            </div>
            <div style="text-align:right;">
              <span style="font-weight:700; font-size:1.1rem;">₹${t.totalPrice.toLocaleString()}</span>
              <span class="badge badge-easy" style="display:block; margin-top:4px;">SUCCESS</span>
            </div>
          </div>
        `).join('');
      }
    } 
    
    else if (tabId === 'notifs') {
      const container = document.getElementById('dash-notifs-container');
      container.innerHTML = `
        <div style="padding:12px; background:var(--bg-input); border-radius:8px; margin-bottom:10px; border-left: 3px solid var(--color-primary);">
          <div style="font-size:0.8rem; color:var(--text-muted); text-align:right;">2026-07-12</div>
          <p style="font-size:0.9rem; font-weight:500;">Welcome to the new ProjectNest fullstack server integration platform!</p>
        </div>
      `;
    } 
    
    else if (tabId === 'certs') {
      const container = document.getElementById('dash-certs-container');
      const purchased = user.purchasedProjects || [];
      const completed = purchased.filter(p => p.progressStep === 5);

      if (completed.length === 0) {
        container.innerHTML = `
          <div style="color:var(--text-muted);">
            <p>Accomplishment Certificates are generated when you mark a project's completion tracker timeline at Step 5 (Testing Completed).</p>
          </div>
        `;
      } else {
        container.innerHTML = completed.map(p => `
          <div class="glass-panel flex-space" style="padding:20px; margin-bottom:16px; background:rgba(255,255,255,0.01);">
            <div>
              <h4>Certificate for: ${p.title}</h4>
            </div>
            <button class="btn-primary" style="padding:8px 12px; font-size:0.8rem;" onclick="app.dashboard.openCertificateGenerator('${p.title}')">
              View & Download
            </button>
          </div>
        `).join('');
      }
    }
  },

  updateProgress: async function(projId, step) {
    try {
      const response = await fetch(app.API_URL + '/dashboard/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: app.db.currentUser.email,
          projectId: projId,
          step: step
        })
      });
      if (response.ok) {
        app.toast.show('Progress step updated!', 'success');
        await app.db.loadUserWorkspace();
        this.switchTab('projects');
      }
    } catch (err) {
      console.error(err);
    }
  },

  joinMeetingSim: function(aptId) {
    const s = app.db.appointments.find(a => a.id === aptId);
    if (!s) return;

    document.getElementById('meeting-title-text').innerText = `1:1 Live Meeting - ${s.mentorName}`;
    app.modal.open('meeting');
    
    setTimeout(() => {
      const feed = document.getElementById('meeting-main-feed');
      if (feed) {
        feed.innerHTML = `
          <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80" style="width:100%; height:100%; object-fit:cover;" alt="Mentor Screen">
          <div style="position:absolute; top:20px; left:20px; padding:6px 12px; background:rgba(0,0,0,0.6); border-radius:4px; font-weight:700; font-size:0.8rem;">
            LIVE: ${s.mentorName}
          </div>
        `;
      }
    }, 2000);
  },

  openUploadAssignment: function() { app.modal.open('assignment'); },
  submitAssignment: function() {
    app.toast.show('Lab report uploaded successfully!', 'success');
    app.modal.close('assignment');
  },

  openCertificateGenerator: function(projTitle) {
    const viewPane = document.getElementById('dash-pane-certs');
    viewPane.innerHTML = `
      <button class="btn-secondary" style="margin-bottom:20px;" onclick="app.dashboard.switchTab('certs')"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <div class="certificate-generator-wrap">
        <button class="btn-primary" style="margin-bottom:20px;" onclick="window.print()"><i class="fa-solid fa-print"></i> Print Accomplishment Certificate</button>
        
        <div class="certificate-preview">
          <div class="certificate-title">CERTIFICATE OF ACCOMPLISHMENT</div>
          <p style="margin-top:30px; font-size:1.1rem; font-style:italic;">This academic credential is proudly awarded to</p>
          <div class="cert-student-name">${app.db.currentUser.name}</div>
          <p style="font-size:1rem; max-width:600px; margin:0 auto 30px auto; line-height:1.6; color:#444;">
            for successful completion and execution of the engineering project entitled:
            <br><b style="color:#111; font-size:1.2rem;">${projTitle}</b>
          </p>
        </div>
      </div>
    `;
  }
};


// --- ADMIN DASHBOARD PANEL ---
app.admin = {
  activeTab: 'analytics',

  render: function() {
    this.switchTab(this.activeTab);
  },

  switchTab: async function(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('[id^="admin-btn-"]').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById('admin-btn-' + tabId);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('[id^="admin-pane-"]').forEach(p => p.classList.remove('active'));
    const targetPane = document.getElementById('admin-pane-' + tabId);
    if (targetPane) targetPane.classList.add('active');

    if (tabId === 'users') {
      await this.loadUsersList();
      this.renderUsers();
    } else if (tabId === 'items') {
      this.renderItems();
    } else if (tabId === 'orders') {
      await this.loadOrdersList();
      this.renderOrders();
    } else if (tabId === 'payment') {
      this.loadPaymentSettings();
    }
  },

  loadUsersList: async function() {
    try {
      const response = await fetch(app.API_URL + '/admin/users');
      app.db.users = await response.json();
    } catch (err) {
      console.error(err);
    }
  },

  loadOrdersList: async function() {
    try {
      const response = await fetch(app.API_URL + '/orders');
      app.db.orders = await response.json();
    } catch (err) {
      console.error(err);
    }
  },

  renderUsers: function() {
    const table = document.getElementById('admin-users-table');
    if (!table) return;

    const searchVal = document.getElementById('admin-user-search').value.toLowerCase();
    const filtered = app.db.users.filter(u => u.name.toLowerCase().includes(searchVal) || u.email.toLowerCase().includes(searchVal));

    table.innerHTML = `
      <thead>
        <tr style="border-bottom:2px solid var(--border-color); color:var(--text-muted); font-size:0.8rem; font-weight:600;">
          <th style="padding:12px 6px;">NAME</th>
          <th>EMAIL</th>
          <th>ROLE</th>
          <th>BRANCH</th>
          <th>STATUS</th>
          <th style="text-align:right;">ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(u => `
          <tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:16px 6px;"><b>${u.name}</b></td>
            <td>${u.email}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-civil' : 'badge-cse'}">${u.role.toUpperCase()}</span></td>
            <td>${u.branch}</td>
            <td>
              <span class="badge ${u.blocked ? 'badge-hard' : 'badge-easy'}">${u.blocked ? 'BLOCKED' : 'ACTIVE'}</span>
            </td>
            <td style="text-align:right;">
              <button class="btn-toggle-theme" style="width:32px; height:32px; font-size:0.8rem;" onclick="app.admin.toggleUserBlock('${u.email}')">
                <i class="fa-solid ${u.blocked ? 'fa-lock-open' : 'fa-lock'}"></i>
              </button>
              <button class="btn-toggle-theme" style="width:32px; height:32px; font-size:0.8rem; color:var(--color-danger);" onclick="app.admin.deleteUser('${u.email}')">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
  },

  toggleUserBlock: async function(email) {
    if (email === 'admin@projectnest.com') {
      app.toast.show('Cannot block super-admin accounts!', 'error');
      return;
    }
    try {
      const response = await fetch(app.API_URL + '/admin/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (response.ok) {
        app.toast.show('Block status updated.', 'success');
        await this.loadUsersList();
        this.renderUsers();
      }
    } catch (err) {
      console.error(err);
    }
  },

  deleteUser: async function(email) {
    if (email === 'admin@projectnest.com') return;
    if (confirm('Delete this user?')) {
      try {
        const response = await fetch(app.API_URL + `/admin/users/delete/${encodeURIComponent(email)}`, { method: 'DELETE' });
        if (response.ok) {
          app.toast.show('User deleted.', 'info');
          await this.loadUsersList();
          this.renderUsers();
        }
      } catch (err) {
        console.error(err);
      }
    }
  },

  renderItems: function() {
    const projList = document.getElementById('admin-projects-list');
    if (projList) {
      projList.innerHTML = app.db.projects.map(p => `
        <div class="glass-panel flex-space" style="padding:12px; font-size:0.85rem; background:var(--bg-input);">
          <div>
            <b>${p.title}</b>
            <p style="color:var(--text-muted); font-size:0.75rem;">₹${p.price.toLocaleString()} | Level: ${p.difficulty}</p>
          </div>
          <button class="btn-icon-nav" style="border-color:transparent; color:var(--color-danger);" onclick="app.admin.deleteProject('${p.id}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `).join('');
    }

    const compList = document.getElementById('admin-components-list');
    if (compList) {
      compList.innerHTML = app.db.components.map(c => `
        <div class="glass-panel flex-space" style="padding:12px; font-size:0.85rem; background:var(--bg-input);">
          <div>
            <b>${c.name}</b>
            <p style="color:var(--text-muted); font-size:0.75rem;">Price: ₹${c.price} | Stock: ${c.stock}</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn-toggle-theme" style="width:24px; height:24px; font-size:0.8rem;" onclick="app.admin.adjustStock('${c.id}', 10)">+</button>
            <button class="btn-icon-nav" style="border-color:transparent; color:var(--color-danger);" onclick="app.admin.deleteComponent('${c.id}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  },

  deleteProject: async function(id) {
    if (confirm('Delete project ' + id + '?')) {
      try {
        const response = await fetch(app.API_URL + `/admin/projects/delete/${id}`, { method: 'DELETE' });
        if (response.ok) {
          app.toast.show('Project removed.', 'info');
          await app.db.load();
          this.renderItems();
        }
      } catch (err) {
        console.error(err);
      }
    }
  },

  deleteComponent: async function(id) {
    if (confirm('Delete component ' + id + '?')) {
      try {
        const response = await fetch(app.API_URL + `/admin/components/delete/${id}`, { method: 'DELETE' });
        if (response.ok) {
          app.toast.show('Component removed.', 'info');
          await app.db.load();
          this.renderItems();
        }
      } catch (err) {
        console.error(err);
      }
    }
  },

  adjustStock: async function(id, amount) {
    try {
      const response = await fetch(app.API_URL + '/admin/components/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount })
      });
      if (response.ok) {
        app.toast.show('Stock updated.', 'success');
        await app.db.load();
        this.renderItems();
      }
    } catch (err) {
      console.error(err);
    }
  },

  renderOrders: function() {
    const table = document.getElementById('admin-orders-table');
    if (!table) return;

    table.innerHTML = `
      <thead>
        <tr style="border-bottom:2px solid var(--border-color); color:var(--text-muted); font-size:0.8rem; font-weight:600;">
          <th style="padding:12px 6px;">ORDER ID</th>
          <th>CUSTOMER</th>
          <th>TOTAL</th>
          <th>METHOD</th>
          <th>STATUS</th>
          <th style="text-align:right;">ACTION</th>
        </tr>
      </thead>
      <tbody>
        ${app.db.orders.map(o => `
          <tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:16px 6px;"><b>${o.orderId}</b></td>
            <td>${o.email}</td>
            <td>₹${o.totalPrice.toLocaleString()}</td>
            <td>${o.paymentMethod.toUpperCase()}</td>
            <td><span class="badge badge-easy">PAID</span></td>
            <td style="text-align:right;">
              <button class="btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="app.admin.refundMock('${o.id}')">Refund</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
  },

  refundMock: function(id) {
    app.toast.show('Refund processed successfully!', 'success');
  },

  openAddMentorModal: function() { app.modal.open('admin-mentor'); },
  openAddProjectModal: function() { app.modal.open('admin-project'); },
  openAddComponentModal: function() { app.modal.open('admin-component'); },

  saveMentor: async function() {
    const name = document.getElementById('adm-men-name').value;
    const specialties = document.getElementById('adm-men-specialties').value;
    const company = document.getElementById('adm-men-company').value;
    const bookingsFee = document.getElementById('adm-men-price').value;
    const picFile = document.getElementById('adm-men-pic').files[0];

    if (!name || !specialties || !company) {
      app.toast.show('Name, specialties, and company are required!', 'error');
      return;
    }

    // Construct FormData for picture uploads
    const formData = new FormData();
    formData.append('name', name);
    formData.append('specialties', specialties);
    formData.append('company', company);
    formData.append('bookingsFee', bookingsFee);
    if (picFile) {
      formData.append('pic', picFile);
    }

    try {
      const response = await fetch(app.API_URL + '/admin/mentors/add', {
        method: 'POST',
        body: formData
      });
      const resData = await response.json();
      if (!response.ok) {
        app.toast.show(resData.error || 'Failed saving mentor profile', 'error');
        return;
      }

      app.toast.show('Mentor profile saved and verified.', 'success');
      app.modal.close('admin-mentor');
      
      // Clear inputs
      document.getElementById('adm-men-name').value = '';
      document.getElementById('adm-men-specialties').value = '';
      document.getElementById('adm-men-company').value = '';
      document.getElementById('adm-men-pic').value = '';

      await app.db.load();
      this.switchTab('users');
    } catch (err) {
      app.toast.show('Server error uploading mentor photo profile', 'error');
    }
  },

  saveProject: async function() {
    const title = document.getElementById('adm-proj-title').value;
    const branch = document.getElementById('adm-proj-branch').value;
    const price = parseInt(document.getElementById('adm-proj-price').value) || 1999;
    const diff = document.getElementById('adm-proj-difficulty').value;
    const hours = document.getElementById('adm-proj-hours').value || '30 hours';
    const comps = document.getElementById('adm-proj-components').value.split(',').map(x => x.trim());
    const desc = document.getElementById('adm-proj-desc').value;

    if (!title || !desc) {
      app.toast.show('Title and description are required!', 'error');
      return;
    }

    try {
      const response = await fetch(app.API_URL + '/admin/projects/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, category: branch, price, difficulty: diff, completionTime: hours, components: comps, description: desc
        })
      });
      if (response.ok) {
        app.toast.show('Project uploaded successfully!', 'success');
        app.modal.close('admin-project');
        
        document.getElementById('adm-proj-title').value = '';
        document.getElementById('adm-proj-desc').value = '';
        document.getElementById('adm-proj-components').value = '';

        await app.db.load();
        this.switchTab('items');
      }
    } catch (err) {
      console.error(err);
    }
  },

  saveComponent: async function() {
    const name = document.getElementById('adm-comp-name').value;
    const cat = document.getElementById('adm-comp-cat').value;
    const price = parseInt(document.getElementById('adm-comp-price').value) || 200;
    const stock = parseInt(document.getElementById('adm-comp-stock').value) || 10;
    const specs = document.getElementById('adm-comp-specs').value;

    if (!name) {
      app.toast.show('Component name is required!', 'error');
      return;
    }

    try {
      const response = await fetch(app.API_URL + '/admin/components/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category: cat, price, stock, specs
        })
      });
      if (response.ok) {
        app.toast.show('Store inventory component uploaded.', 'success');
        app.modal.close('admin-component');
        
        document.getElementById('adm-comp-name').value = '';
        document.getElementById('adm-comp-specs').value = '';

        await app.db.load();
        this.switchTab('items');
      }
    } catch (err) {
      console.error(err);
    }
  },

  loadPaymentSettings: function() {
    const dataStr = localStorage.getItem('admin_bank_settings');
    if (dataStr) {
      try {
        const settings = JSON.parse(dataStr);
        document.getElementById('admin-bank-name').value = settings.name || '';
        document.getElementById('admin-bank-brand').value = settings.bankName || '';
        document.getElementById('admin-bank-acc').value = settings.account || '';
        document.getElementById('admin-bank-ifsc').value = settings.ifsc || '';
        document.getElementById('admin-bank-upi').value = settings.upiId || '';
      } catch (e) {
        console.error("Failed to parse admin payment settings", e);
      }
    }
  },

  savePaymentSettings: function() {
    const settings = {
      name: document.getElementById('admin-bank-name').value.trim(),
      bankName: document.getElementById('admin-bank-brand').value.trim(),
      account: document.getElementById('admin-bank-acc').value.trim(),
      ifsc: document.getElementById('admin-bank-ifsc').value.trim(),
      upiId: document.getElementById('admin-bank-upi').value.trim()
    };

    localStorage.setItem('admin_bank_settings', JSON.stringify(settings));
    app.toast.show('Payment Settings Saved Successfully!', 'success');
  }
};


// --- CHAT WITH MENTOR WINDOW MANAGER ---
app.chat = {
  activeMentorId: null,

  openChatWindow: function(mentorId) {
    if (!app.db.currentUser) {
      app.toast.show('Please log in to chat with mentors!', 'error');
      app.router.navigate('auth');
      return;
    }
    const m = app.db.mentors.find(x => x.id === mentorId);
    if (!m) return;

    this.activeMentorId = mentorId;
    document.getElementById('chat-header-title').innerText = `Discussion Channel with ${m.name}`;
    document.getElementById('chat-sidebar-room').innerText = m.name;

    app.modal.open('chat');
    this.renderChatMessages();
  },

  renderChatMessages: function() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const list = [
      { author: 'mentor', text: 'Hi! Let me know if you face compiling errors or circuit issues with the uploaded files.' }
    ];

    container.innerHTML = list.map(msg => `
      <div class="chat-bubble ${msg.author === 'student' ? 'sent' : 'received'}">
        ${msg.text}
      </div>
    `).join('');
  },

  sendDirectMessage: function() {
    const input = document.getElementById('chat-user-message-input');
    const val = input.value.trim();
    if (!val) return;

    const container = document.getElementById('chat-messages-container');
    if (container) {
      container.innerHTML += `<div class="chat-bubble sent">${val}</div>`;
      input.value = '';
      container.scrollTop = container.scrollHeight;

      setTimeout(() => {
        container.innerHTML += `<div class="chat-bubble received">Understood. Please upload your project circuit diagram, and I will review it.</div>`;
        container.scrollTop = container.scrollHeight;
      }, 1500);
    }
  }
};


// --- FLOATING AI ASSISTANT ---
app.ai = {
  isOpen: false,
  responses: {
    ece: 'For Electronics and Communication (ECE), I highly recommend: \n1. IoT Smart Irrigation System (ESP32 NodeMCU, Firebase cloud databases)\n2. Autonomous Path Finding Robot (ROS, SLAM Navigation)',
    cse: 'For Computer Science (CSE), these are top choices: \n1. Driver Drowsiness Detector (Python, OpenCV image tracking)\n2. Cloud Telemetry Dashboard Systems',
    mech: 'For Mechanical (ME) and Robotics: \n1. Quadcopter Obstacle Detection drone\n2. 4-Wheel Pathfinding chassis control',
    civil: 'For Civil Engineering: \n1. Seismic Shear Simulation Analysis (ETABS v19 layouts)\n2. Struct Design reports',
    iot: 'IoT projects are amazing! Explore the "IoT Smart Agriculture Irrigation System" utilizing ESP32 microcontrollers and Blynk dashboard integrations.',
    robot: 'Robotics projects recommendation: check out "Autonomous Path Finding Robot using LiDAR & SLAM" with ROS libraries.'
  },

  init: function() {
    // Initial logs
  },

  toggleWindow: function() {
    this.isOpen = !this.isOpen;
    document.getElementById('ai-chat-window').classList.toggle('active', this.isOpen);
  },

  sendMessage: function() {
    const input = document.getElementById('ai-chat-input');
    const val = input.value.trim().toLowerCase();
    if (!val) return;

    const history = document.getElementById('ai-chat-history');
    if (!history) return;

    history.innerHTML += `<div class="ai-msg user">${input.value}</div>`;
    input.value = '';
    history.scrollTop = history.scrollHeight;

    let reply = 'I support smart branch recommendation! Try typing "ECE projects", "CSE ideas", "IoT", or "Robotics".';
    if (val.includes('ece') || val.includes('electronics')) reply = this.responses.ece;
    else if (val.includes('cse') || val.includes('computer') || val.includes('software')) reply = this.responses.cse;
    else if (val.includes('mech') || val.includes('mechanical')) reply = this.responses.mech;
    else if (val.includes('civil') || val.includes('structure')) reply = this.responses.civil;
    else if (val.includes('iot') || val.includes('internet of things')) reply = this.responses.iot;
    else if (val.includes('robot') || val.includes('lidar') || val.includes('slam')) reply = this.responses.robot;

    setTimeout(() => {
      history.innerHTML += `<div class="ai-msg ai">${reply.replace(/\n/g, '<br>')}</div>`;
      history.scrollTop = history.scrollHeight;
    }, 800);
  }
};


// --- NOTIFICATION & TOAST MODULES ---
app.notif = {
  isDropdownOpen: false,
  init: function() {
    this.updateCounter();
  },
  updateCounter: function() {
    const badge = document.getElementById('header-notif-count');
    if (badge) badge.style.display = 'none';
  },
  toggleDropdown: function() {
    if (app.db.currentUser) {
      app.router.navigate('dashboard');
      setTimeout(() => app.dashboard.switchTab('notifs'), 100);
    } else {
      app.toast.show('Please login to view notifications.', 'info');
      app.router.navigate('auth');
    }
  }
};

app.toast = {
  show: function(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const iconMap = {
      success: 'fa-circle-check',
      error: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };

    const t = document.createElement('div');
    t.className = `toast-msg ${type}`;
    t.innerHTML = `
      <i class="fa-solid ${iconMap[type] || 'fa-circle-info'}"></i>
      <span>${msg}</span>
    `;

    container.appendChild(t);

    setTimeout(() => {
      t.style.animation = 'slide-in-toast 0.3s reverse forwards';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }
};


// --- MODAL UTILITIES ---
app.modal = {
  open: function(modalId) {
    const el = document.getElementById('modal-' + modalId);
    if (el) el.classList.add('active');
  },
  close: function(modalId) {
    const el = document.getElementById('modal-' + modalId);
    if (el) el.classList.remove('active');
  }
};


// Run initializations
window.onload = function() {
  app.init();
};
