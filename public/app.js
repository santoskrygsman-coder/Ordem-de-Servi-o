/**
 * Lógica do Sistema de Controle de Ordem de Serviço (OS)
 * Tecnologia: Vanilla JS + HTTP Fetch (Comunicando com o Servidor Local)
 */

const API_BASE = ''; // URL relativa pois o frontend é servido pela mesma porta

// Objeto de Gerenciamento do App
const app = {
  currentTab: 'dashboard-view',
  isCanvasBlank: true,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  canvas: null,
  ctx: null,
  originalTitle: '',

  // Inicialização do Sistema
  async init() {
    try {
      this.initEvents();
      this.initCanvas();
      
      const token = this.getToken();
      if (!token) {
        this.showLoginScreen();
      } else {
        this.hideLoginScreen();
        await this.loadCompanySettings();
        await this.renderDashboard();
      }
    } catch (error) {
      console.error('Falha ao inicializar:', error);
    }
  },

  // --- MÉTODOS DE CONTROLE DE SESSÃO E LOGIN ---

  getToken() {
    return localStorage.getItem('techmanager_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('techmanager_token', token);
    } else {
      localStorage.removeItem('techmanager_token');
    }
  },

  showLoginScreen() {
    document.getElementById('login-screen').classList.add('active');
  },

  hideLoginScreen() {
    document.getElementById('login-screen').classList.remove('active');
  },

  async handleLoginSubmit(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error-msg');
    
    errorMsg.style.display = 'none';
    
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar login.');
      }
      
      this.setToken(data.token);
      this.hideLoginScreen();
      
      // Carregar dados e renderizar dashboard
      await this.loadCompanySettings();
      await this.renderDashboard();
      this.showToast('Login realizado com sucesso!', 'success');
    } catch (err) {
      errorMsg.innerText = err.message;
      errorMsg.style.display = 'block';
    }
  },

  logout() {
    this.setToken(null);
    this.showLoginScreen();
    this.showToast('Você saiu do sistema.', 'info');
    document.getElementById('login-form').reset();
  },

  async handleChangePasswordSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('password-current').value;
    const newPassword = document.getElementById('password-new').value;
    
    try {
      const res = await this.apiFetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao atualizar senha.');
      }
      
      this.showToast('Senha atualizada com sucesso!', 'success');
      document.getElementById('change-password-form').reset();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // --- HELPER COMPARTILHADO DE CHAMADAS À API COM JWT ---

  async apiFetch(url, options = {}) {
    const token = this.getToken();
    options.headers = options.headers || {};
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, options);
    
    // Se o token expirou ou é inválido, desloga e manda para a tela de login
    if (res.status === 401 || res.status === 403) {
      this.logout();
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    
    return res;
  },

  // --- MÉTODOS DE COMUNICAÇÃO COM A API REST ---
  
  async getSettings() {
    const res = await this.apiFetch(`${API_BASE}/api/settings`);
    if (!res.ok) throw new Error('Erro ao carregar configurações');
    return await res.json();
  },

  async saveSettings(settings) {
    const res = await this.apiFetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('Erro ao salvar configurações');
    return await res.json();
  },

  async getAllOrders() {
    const res = await this.apiFetch(`${API_BASE}/api/orders`);
    if (!res.ok) throw new Error('Erro ao carregar ordens de serviço');
    return await res.json();
  },

  async getOrder(id) {
    const res = await this.apiFetch(`${API_BASE}/api/orders/${id}`);
    if (!res.ok) throw new Error('Erro ao carregar ordem de serviço');
    return await res.json();
  },

  async saveOrder(order) {
    const res = await this.apiFetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    if (!res.ok) throw new Error('Erro ao salvar ordem de serviço');
    return await res.json();
  },

  async deleteOrder(id) {
    const res = await this.apiFetch(`${API_BASE}/api/orders/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Erro ao excluir ordem de serviço');
    return await res.json();
  },

  async importBackupData(backupData) {
    const res = await this.apiFetch(`${API_BASE}/api/backup/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupData)
    });
    if (!res.ok) throw new Error('Erro ao importar backup');
    return await res.json();
  },

  // --- COMPONENTES DA INTERFACE ---

  // Inicializar Eventos do UI
  initEvents() {
    // Menu da Sidebar
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.getAttribute('data-target');
        this.switchTab(target);
      });
    });

    // Form de Nova OS - Cálculos automáticos ao digitar valores
    document.getElementById('value-parts').addEventListener('input', () => this.calculateTotalDisplay());
    document.getElementById('value-labor').addEventListener('input', () => this.calculateTotalDisplay());

    // Autocompletar cliente ao digitar o nome
    document.getElementById('client-name').addEventListener('input', (e) => this.handleClientNameInput(e));

    // Submissão do Form de OS
    document.getElementById('os-form').addEventListener('submit', (e) => this.handleSaveOS(e));

    // Pesquisa e Filtros na Lista
    document.getElementById('search-os-input').addEventListener('input', () => this.renderListOS());
    document.getElementById('filter-status-select').addEventListener('change', () => this.renderListOS());

    // Form de Configurações
    document.getElementById('settings-form').addEventListener('submit', (e) => this.handleSaveSettings(e));

    // Upload e Remoção de Logotipo
    const logoUploadBox = document.getElementById('logo-upload-box');
    const logoFileInput = document.getElementById('logo-file-input');
    const removeLogoBtn = document.getElementById('remove-logo-btn');

    logoUploadBox.addEventListener('click', () => logoFileInput.click());
    logoFileInput.addEventListener('change', (e) => this.handleLogoUpload(e));
    removeLogoBtn.addEventListener('click', () => this.handleRemoveLogo());

    // Botões de Backup
    document.getElementById('export-db-btn').addEventListener('click', () => this.handleExportBackup());
    
    const importBtn = document.getElementById('import-db-btn');
    const importFileInput = document.getElementById('import-db-file-input');
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', (e) => this.handleImportBackup(e));

    // Modal de Impressão
    document.getElementById('close-print-modal-btn').addEventListener('click', () => this.closePrintModal());
    document.getElementById('close-modal-footer-btn').addEventListener('click', () => this.closePrintModal());
    document.getElementById('print-os-trigger-btn').addEventListener('click', () => window.print());

    // Seletor de Problemas Comuns
    document.getElementById('common-problems-select').addEventListener('change', (e) => {
      const selected = e.target.value;
      if (selected) {
        const textarea = document.getElementById('service-problem');
        if (textarea.value) {
          textarea.value += '\n' + selected;
        } else {
          textarea.value = selected;
        }
        e.target.value = ''; // Reset do seletor
      }
    });

    // Filtros e Impressão de Relatórios
    document.getElementById('btn-apply-report-filters').addEventListener('click', () => this.renderReports());
    document.getElementById('print-report-btn').addEventListener('click', () => this.printReport());

    // Fluxo de Autenticação (Login, Logout e Senha)
    document.getElementById('login-form').addEventListener('submit', (e) => this.handleLoginSubmit(e));
    document.getElementById('btn-logout').addEventListener('click', (e) => {
      e.preventDefault();
      this.logout();
    });
    document.getElementById('change-password-form').addEventListener('submit', (e) => this.handleChangePasswordSubmit(e));
  },

  // Alternador de Abas (Navegação)
  async switchTab(targetTabId) {
    document.querySelectorAll('.view-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));

    const activePane = document.getElementById(targetTabId);
    if (activePane) activePane.classList.add('active');

    const menuItem = document.querySelector(`.menu-item[data-target="${targetTabId}"]`);
    if (menuItem) menuItem.classList.add('active');

    this.currentTab = targetTabId;

    if (targetTabId === 'dashboard-view') {
      await this.renderDashboard();
    } else if (targetTabId === 'list-os-view') {
      await this.renderListOS();
    } else if (targetTabId === 'new-os-view') {
      const osIdInput = document.getElementById('os-id').value;
      if (!osIdInput) {
        this.resetOSForm();
      }
      await this.updateClientsDatalist(); // Atualiza sugestões de clientes
    } else if (targetTabId === 'settings-view') {
      await this.loadCompanySettings();
    } else if (targetTabId === 'reports-view') {
      await this.initReportsView();
    }
  },

  // --- AUTOCOMPLETAR CLIENTE ---
  
  // Atualiza a lista <datalist> com nomes de clientes já cadastrados
  async updateClientsDatalist() {
    try {
      const orders = await this.getAllOrders();
      // Extrair nomes únicos de clientes
      const uniqueNames = [...new Set(orders.map(o => o.customerName).filter(Boolean))];
      const datalist = document.getElementById('clients-datalist');
      datalist.innerHTML = '';
      
      uniqueNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
      });
    } catch (err) {
      console.error('Erro ao atualizar lista de clientes:', err);
    }
  },

  // Dispara ao digitar no nome do cliente. Se o nome coincidir perfeitamente com um cliente anterior, preenche os dados
  async handleClientNameInput(e) {
    const typedName = e.target.value.trim();
    if (!typedName) return;

    try {
      const orders = await this.getAllOrders();
      // Encontrar a OS mais recente deste cliente
      const matched = orders
        .filter(o => o.customerName && o.customerName.toLowerCase() === typedName.toLowerCase())
        .sort((a, b) => b.id - a.id)[0];

      if (matched) {
        document.getElementById('client-phone').value = matched.customerPhone || '';
        document.getElementById('client-email').value = matched.customerEmail || '';
        document.getElementById('client-address').value = matched.customerAddress || '';
        this.showToast('Dados de contato do cliente carregados automaticamente!', 'info');
      }
    } catch (err) {
      console.error(err);
    }
  },

  // --- GESTÃO DE ASSINATURA CANVAS ---
  initCanvas() {
    this.canvas = document.getElementById('signature-pad');
    this.ctx = this.canvas.getContext('2d');

    const resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    resizeObserver.observe(this.canvas);

    document.getElementById('clear-signature-btn').addEventListener('click', () => this.clearSignature());

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDrawing = true;
      const rect = this.canvas.getBoundingClientRect();
      this.lastX = e.clientX - rect.left;
      this.lastY = e.clientY - rect.top;
      this.isCanvasBlank = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDrawing) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();

      this.lastX = x;
      this.lastY = y;
    });

    this.canvas.addEventListener('mouseup', () => this.isDrawing = false);
    this.canvas.addEventListener('mouseout', () => this.isDrawing = false);

    // Eventos Touch
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.touches[0].clientX - rect.left;
        this.lastY = e.touches[0].clientY - rect.top;
        this.isCanvasBlank = false;
        e.preventDefault();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.isDrawing || e.touches.length !== 1) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;

      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();

      this.lastX = x;
      this.lastY = y;
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => this.isDrawing = false);
  },

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;

    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.isCanvasBlank = true;
  },

  clearSignature() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.isCanvasBlank = true;
  },

  // --- LÓGICA DO FORMULÁRIO DE ORDEM DE SERVIÇO ---

  calculateTotalDisplay() {
    const parts = parseFloat(document.getElementById('value-parts').value) || 0;
    const labor = parseFloat(document.getElementById('value-labor').value) || 0;
    const total = parts + labor;
    document.getElementById('value-total-display').value = this.formatCurrency(total);
  },

  resetOSForm() {
    document.getElementById('os-form').reset();
    document.getElementById('os-id').value = '';
    document.getElementById('form-view-title').innerText = 'Nova Ordem de Serviço';
    document.getElementById('form-view-desc').innerText = 'Cadastre um novo serviço de manutenção de computador';
    document.getElementById('value-total-display').value = 'R$ 0,00';
    document.getElementById('payment-status').value = 'PENDENTE';
    document.getElementById('payment-method').value = '';
    
    document.getElementById('service-start-date').value = this.formatDateTimeLocal(new Date());
    this.clearSignature();
  },

  cancelForm() {
    this.resetOSForm();
    this.switchTab('list-os-view');
  },

  async handleSaveOS(e) {
    e.preventDefault();

    const osIdStr = document.getElementById('os-id').value;
    const partsVal = parseFloat(document.getElementById('value-parts').value) || 0;
    const partsCostVal = parseFloat(document.getElementById('value-parts-cost').value) || 0;
    const laborVal = parseFloat(document.getElementById('value-labor').value) || 0;

    let signature = null;
    if (!this.isCanvasBlank) {
      signature = this.canvas.toDataURL('image/png');
    }

    const orderData = {
      customerName: document.getElementById('client-name').value,
      customerPhone: document.getElementById('client-phone').value,
      customerEmail: document.getElementById('client-email').value,
      customerAddress: document.getElementById('client-address').value,
      deviceBrand: document.getElementById('device-brand').value,
      deviceModel: document.getElementById('device-model').value,
      deviceSerial: document.getElementById('device-serial').value,
      devicePassword: document.getElementById('device-password').value,
      problem: document.getElementById('service-problem').value,
      diagnosis: document.getElementById('service-diagnosis').value,
      startDate: document.getElementById('service-start-date').value,
      endDate: document.getElementById('service-end-date').value || null,
      warranty: document.getElementById('service-warranty').value,
      status: document.getElementById('service-status').value,
      paymentStatus: document.getElementById('payment-status').value,
      paymentMethod: document.getElementById('payment-method').value,
      partsValue: partsVal,
      partsCostValue: partsCostVal, // Novo campo
      laborValue: laborVal,
      totalValue: partsVal + laborVal
    };

    if (osIdStr) {
      orderData.id = parseInt(osIdStr);
      if (!signature) {
        const oldOrder = await this.getOrder(orderData.id);
        if (oldOrder && oldOrder.signatureBytes) {
          orderData.signatureBytes = oldOrder.signatureBytes;
        }
      } else {
        orderData.signatureBytes = signature;
      }
    } else {
      orderData.signatureBytes = signature;
      orderData.createdAt = new Date().toISOString();
    }

    try {
      const savedOrder = await this.saveOrder(orderData);
      this.showToast(`Ordem de serviço nº ${String(savedOrder.id).padStart(4, '0')} salva com sucesso!`, 'success');
      this.resetOSForm();
      this.switchTab('list-os-view');
    } catch (err) {
      console.error(err);
      this.showToast('Erro ao salvar Ordem de Serviço.', 'error');
    }
  },

  async editOrder(id) {
    try {
      const order = await this.getOrder(id);
      if (!order) {
        this.showToast('Ordem de serviço não localizada.', 'error');
        return;
      }

      this.switchTab('new-os-view');
      
      document.getElementById('form-view-title').innerText = `Editar OS #${String(order.id).padStart(4, '0')}`;
      document.getElementById('form-view-desc').innerText = 'Modifique as informações necessárias e clique em salvar';

      document.getElementById('os-id').value = order.id;
      document.getElementById('client-name').value = order.customerName || '';
      document.getElementById('client-phone').value = order.customerPhone || '';
      document.getElementById('client-email').value = order.customerEmail || '';
      document.getElementById('client-address').value = order.customerAddress || '';
      
      document.getElementById('device-brand').value = order.deviceBrand || '';
      document.getElementById('device-model').value = order.deviceModel || '';
      document.getElementById('device-serial').value = order.deviceSerial || '';
      document.getElementById('device-password').value = order.devicePassword || '';
      
      document.getElementById('service-problem').value = order.problem || '';
      document.getElementById('service-diagnosis').value = order.diagnosis || '';
      
      document.getElementById('service-start-date').value = order.startDate ? this.formatDateTimeLocal(new Date(order.startDate)) : '';
      document.getElementById('service-end-date').value = order.endDate ? this.formatDateTimeLocal(new Date(order.endDate)) : '';
      document.getElementById('service-warranty').value = order.warranty || '';
      document.getElementById('service-status').value = order.status || 'EM_ANDAMENTO';
      document.getElementById('payment-status').value = order.paymentStatus || 'PENDENTE';
      document.getElementById('payment-method').value = order.paymentMethod || '';
      
      document.getElementById('value-parts').value = order.partsValue || '';
      document.getElementById('value-parts-cost').value = order.partsCostValue || ''; // Novo campo
      document.getElementById('value-labor').value = order.laborValue || '';
      
      this.calculateTotalDisplay();

      this.clearSignature();
      if (order.signatureBytes) {
        const img = new Image();
        img.onload = () => {
          this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
          this.isCanvasBlank = false;
        };
        img.src = order.signatureBytes;
      }
    } catch (err) {
      console.error(err);
      this.showToast('Erro ao carregar dados para edição.', 'error');
    }
  },

  async removeOrder(id) {
    const code = String(id).padStart(4, '0');
    if (confirm(`Tem certeza que deseja excluir permanentemente a OS #${code}?`)) {
      try {
        await this.deleteOrder(id);
        this.showToast(`Ordem de serviço #${code} excluída com sucesso.`, 'success');
        if (this.currentTab === 'dashboard-view') {
          await this.renderDashboard();
        } else {
          await this.renderListOS();
        }
      } catch (err) {
        console.error(err);
        this.showToast('Erro ao excluir ordem de serviço.', 'error');
      }
    }
  },

  async cancelOrderDirectly(id) {
    const code = String(id).padStart(4, '0');
    if (confirm(`Tem certeza que deseja cancelar a OS #${code}?`)) {
      try {
        const order = await this.getOrder(id);
        if (order) {
          order.status = 'CANCELADO';
          await this.saveOrder(order);
          this.showToast(`Ordem de serviço #${code} foi cancelada!`, 'success');
          if (this.currentTab === 'dashboard-view') {
            await this.renderDashboard();
          } else {
            await this.renderListOS();
          }
        }
      } catch (err) {
        console.error(err);
        this.showToast('Erro ao cancelar a ordem de serviço.', 'error');
      }
    }
  },

  async printTag(id) {
    try {
      const order = await this.getOrder(id);
      if (!order) return;

      document.body.classList.add('print-tag-mode');
      document.body.classList.remove('print-os-mode');
      document.body.classList.remove('print-report-mode');

      const originalTitle = document.title;
      document.title = `Etiqueta_OS_${String(order.id).padStart(4, '0')}`;

      // Preencher dados da etiqueta
      document.getElementById('tag-os-code').innerText = `#OS-${String(order.id).padStart(4, '0')}`;
      document.getElementById('tag-date').innerText = this.formatDateBr(order.startDate).split(' às ')[0];
      document.getElementById('tag-client-name').innerText = order.customerName || '---';
      document.getElementById('tag-client-phone').innerText = order.customerPhone || '---';
      document.getElementById('tag-device').innerText = `${order.deviceBrand || ''} ${order.deviceModel || ''} ${order.deviceSerial ? `(S/N: ${order.deviceSerial})` : ''}`.trim() || '---';
      document.getElementById('tag-problem').innerText = order.problem || '---';

      // Disparar impressão
      window.print();

      // Limpar classes após impressão
      const cleanUp = () => {
        document.body.classList.remove('print-tag-mode');
        document.title = originalTitle;
        window.removeEventListener('afterprint', cleanUp);
      };
      window.addEventListener('afterprint', cleanUp);
      setTimeout(cleanUp, 1000);

    } catch (err) {
      console.error(err);
      this.showToast('Erro ao gerar etiqueta de bancada.', 'error');
    }
  },

  // --- RENDERIZAÇÃO DE INTERFACE (VIEW RENDERS) ---

  async renderDashboard() {
    try {
      const orders = await this.getAllOrders();

      const totalCount = orders.length;
      const pendingCount = orders.filter(o => o.status === 'PENDENTE' || o.status === 'EM_ANDAMENTO').length;
      const completedCount = orders.filter(o => o.status === 'CONCLUIDO').length;
      
      const revenue = orders
        .filter(o => o.status === 'CONCLUIDO')
        .reduce((sum, o) => sum + (o.totalValue || 0), 0);

      document.getElementById('metric-total-count').innerText = totalCount;
      document.getElementById('metric-pending-count').innerText = pendingCount;
      document.getElementById('metric-completed-count').innerText = completedCount;
      document.getElementById('metric-revenue-val').innerText = this.formatCurrency(revenue);

      const sortedOrders = [...orders].sort((a, b) => b.id - a.id).slice(0, 5);
      const tbody = document.getElementById('recent-os-table-body');
      tbody.innerHTML = '';

      if (sortedOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" align="center" class="text-muted">Nenhum serviço registrado recentemente.</td></tr>`;
        return;
      }

      sortedOrders.forEach(o => {
        const tr = document.createElement('tr');
        const code = String(o.id).padStart(4, '0');
        const statusBadge = this.getStatusBadge(o.status);
        const deviceText = `${o.deviceBrand} ${o.deviceModel}`;

        tr.innerHTML = `
          <td><strong>#${code}</strong></td>
          <td>${o.customerName}</td>
          <td class="hide-mobile">${deviceText}</td>
          <td>${statusBadge}</td>
          <td>${this.formatCurrency(o.totalValue)}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn" title="Visualizar / Imprimir" onclick="app.openPrintModal(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M17 17h2a2 2 0 002-2v-5a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h6z"/></svg>
              </button>
              <button class="action-btn" title="Imprimir Etiqueta de Bancada" onclick="app.printTag(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
              </button>
              <button class="action-btn" title="Editar" onclick="app.editOrder(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              ${o.status !== 'CANCELADO' && o.status !== 'CONCLUIDO' ? `
              <button class="action-btn action-btn-cancel" title="Cancelar OS" onclick="app.cancelOrderDirectly(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
              ` : ''}
              <button class="action-btn action-btn-delete" title="Excluir" onclick="app.removeOrder(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
    }
  },

  async renderListOS() {
    try {
      const orders = await this.getAllOrders();
      const searchQuery = document.getElementById('search-os-input').value.toLowerCase();
      const statusFilter = document.getElementById('filter-status-select').value;

      let filtered = orders.filter(o => {
        if (statusFilter !== 'ALL' && o.status !== statusFilter) {
          return false;
        }

        if (searchQuery) {
          const code = String(o.id).padStart(4, '0');
          const client = (o.customerName || '').toLowerCase();
          const brand = (o.deviceBrand || '').toLowerCase();
          const model = (o.deviceModel || '').toLowerCase();
          const problem = (o.problem || '').toLowerCase();
          
          return (
            code.includes(searchQuery) ||
            client.includes(searchQuery) ||
            brand.includes(searchQuery) ||
            model.includes(searchQuery) ||
            problem.includes(searchQuery)
          );
        }

        return true;
      });

      filtered.sort((a, b) => b.id - a.id);

      const tbody = document.getElementById('list-os-table-body');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" align="center" class="text-muted">Nenhuma ordem de serviço localizada para os termos filtrados.</td></tr>`;
        return;
      }

      filtered.forEach(o => {
        const tr = document.createElement('tr');
        const code = String(o.id).padStart(4, '0');
        const statusBadge = this.getStatusBadge(o.status);
        const deviceText = `${o.deviceBrand} ${o.deviceModel}`;

        tr.innerHTML = `
          <td><strong>#${code}</strong></td>
          <td>${o.customerName}</td>
          <td class="hide-mobile">${deviceText}</td>
          <td class="hide-mobile">${this.formatDateBr(o.startDate).split(' às ')[0]}</td>
          <td>${statusBadge}</td>
          <td class="hide-mobile">${o.warranty || 'Não Informado'}</td>
          <td>${this.formatCurrency(o.totalValue)}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn" title="Visualizar / Imprimir" onclick="app.openPrintModal(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M17 17h2a2 2 0 002-2v-5a2 2 0 00-2-2H5a2 2 0 00-2 2v5a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h6z"/></svg>
              </button>
              <button class="action-btn" title="Imprimir Etiqueta de Bancada" onclick="app.printTag(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
              </button>
              <button class="action-btn" title="Editar" onclick="app.editOrder(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              ${o.status !== 'CANCELADO' && o.status !== 'CONCLUIDO' ? `
              <button class="action-btn action-btn-cancel" title="Cancelar OS" onclick="app.cancelOrderDirectly(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
              ` : ''}
              <button class="action-btn action-btn-delete" title="Excluir" onclick="app.removeOrder(${o.id})">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });

    } catch (err) {
      console.error(err);
    }
  },

  // --- CONFIGURAÇÕES DA EMPRESA E LOGOTIPO ---

  async loadCompanySettings() {
    try {
      const company = await this.getSettings();
      
      document.getElementById('company-name').value = company.name || '';
      document.getElementById('company-cnpj').value = company.cnpj || '';
      document.getElementById('company-phone').value = company.phone || '';
      document.getElementById('company-email').value = company.email || '';
      document.getElementById('company-address').value = company.address || '';
      document.getElementById('company-warranty-terms').value = company.warrantyTerms || '';

      const logoPreview = document.getElementById('logo-preview');
      const logoPlaceholder = document.getElementById('logo-placeholder');
      const removeLogoBtn = document.getElementById('remove-logo-btn');
      const container = document.getElementById('logo-preview-container');

      if (company.logoBase64) {
        logoPreview.src = company.logoBase64;
        container.style.display = 'block';
        logoPlaceholder.style.display = 'none';
        removeLogoBtn.style.display = 'block';
      } else {
        logoPreview.src = '';
        container.style.display = 'none';
        logoPlaceholder.style.display = 'flex';
        removeLogoBtn.style.display = 'none';
      }
    } catch (err) {
      console.error(err);
    }
  },

  async handleSaveSettings(e) {
    e.preventDefault();

    const companyData = {};
    companyData.name = document.getElementById('company-name').value;
    companyData.cnpj = document.getElementById('company-cnpj').value;
    companyData.phone = document.getElementById('company-phone').value;
    companyData.email = document.getElementById('company-email').value;
    companyData.address = document.getElementById('company-address').value;
    companyData.warrantyTerms = document.getElementById('company-warranty-terms').value;

    try {
      const currentCompany = await this.getSettings();
      if (currentCompany.logoBase64) {
        companyData.logoBase64 = currentCompany.logoBase64;
      }

      await this.saveSettings(companyData);
      this.showToast('Configurações da empresa salvas!', 'success');
    } catch (err) {
      console.error(err);
      this.showToast('Erro ao salvar configurações.', 'error');
    }
  },

  handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      this.showToast('O arquivo excede o limite de tamanho de 1MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target.result;
      
      try {
        const companyData = await this.getSettings() || {};
        companyData.logoBase64 = base64Data;
        await this.saveSettings(companyData);
        
        await this.loadCompanySettings();
        this.showToast('Logotipo atualizado!', 'success');
      } catch (err) {
        console.error(err);
        this.showToast('Erro ao gravar logotipo.', 'error');
      }
    };
    reader.readAsDataURL(file);
  },

  async handleRemoveLogo() {
    if (confirm('Deseja realmente remover o logotipo atual?')) {
      try {
        const companyData = await this.getSettings() || {};
        delete companyData.logoBase64;
        await this.saveSettings(companyData);
        
        await this.loadCompanySettings();
        this.showToast('Logotipo removido.', 'success');
      } catch (err) {
        console.error(err);
        this.showToast('Erro ao remover logotipo.', 'error');
      }
    }
  },

  // --- EXPORTAR E IMPORTAR BACKUP (COMUNICANDO COM O SERVIDORES) ---

  async handleExportBackup() {
    try {
      const orders = await this.getAllOrders();
      const companyData = await this.getSettings() || {};

      const backupObj = {
        app: 'TechManagerOS',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
          company_data: companyData
        },
        orders: orders
      };

      const dataStr = JSON.stringify(backupObj, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const dateStr = new Date().toISOString().slice(0, 10);
      const exportFileDefaultName = `techmanager_backup_${dateStr}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      this.showToast('Backup gerado e baixado!', 'success');
    } catch (err) {
      console.error(err);
      this.showToast('Erro ao exportar banco de dados.', 'error');
    }
  },

  handleImportBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (confirm('ATENÇÃO: Importar este arquivo substituirá TODAS as ordens de serviço e configurações salvas atualmente no SERVIDOR. Deseja prosseguir?')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          
          if (importedData.app !== 'TechManagerOS' || !importedData.orders || !importedData.settings) {
            throw new Error('Arquivo de backup inválido.');
          }

          // Enviar os dados de backup completos para a rota de importação do servidor
          const importPayload = {
            orders: importedData.orders,
            settings: importedData.settings.company_data || importedData.settings
          };

          await this.importBackupData(importPayload);

          this.showToast('Dados importados com sucesso! Recarregando...', 'success');
          
          setTimeout(() => {
            window.location.reload();
          }, 1500);

        } catch (err) {
          console.error(err);
          this.showToast('Erro ao ler backup. Certifique-se de que é um arquivo JSON válido gerado pelo sistema.', 'error');
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  },

  // --- MODAL DE VISUALIZAÇÃO E IMPRESSÃO (PDF) ---

  async openPrintModal(id) {
    try {
      const order = await this.getOrder(id);
      if (!order) return;

      document.body.classList.add('print-os-mode');
      document.body.classList.remove('print-report-mode');
      this.originalTitle = document.title;
      document.title = `OS-${String(order.id).padStart(4, '0')} - ${order.customerName}`;

      const company = await this.getSettings() || {};

      const logoPlaceholder = document.getElementById('print-logo-placeholder');
      const logoImg = document.getElementById('print-logo-img');

      if (company.logoBase64) {
        logoImg.src = company.logoBase64;
        logoImg.style.display = 'block';
        logoPlaceholder.style.display = 'none';
      } else {
        logoImg.src = '';
        logoImg.style.display = 'none';
        logoPlaceholder.style.display = 'flex';
      }

      document.getElementById('print-company-name').innerText = company.name || 'Sua Empresa Aqui';
      document.getElementById('print-company-cnpj').innerText = company.cnpj ? `CNPJ/CPF: ${company.cnpj}` : '';
      document.getElementById('print-company-phone').innerText = company.phone ? `Fone: ${company.phone}` : '';
      document.getElementById('print-company-email').innerText = company.email ? `E-mail: ${company.email}` : '';
      document.getElementById('print-company-address').innerText = company.address || '';

      document.getElementById('print-os-code').innerText = `#OS-${String(order.id).padStart(4, '0')}`;
      
      const statusBadge = document.getElementById('print-os-status');
      statusBadge.innerText = this.translateStatus(order.status);
      statusBadge.className = 'os-doc-status-badge'; // reset
      statusBadge.classList.add(`status-print-${order.status}`);

      document.getElementById('print-client-name').innerText = order.customerName || '---';
      document.getElementById('print-client-phone').innerText = order.customerPhone || '---';
      document.getElementById('print-client-email').innerText = order.customerEmail || '---';
      document.getElementById('print-client-address').innerText = order.customerAddress || '---';

      document.getElementById('print-device-brand-model').innerText = `${order.deviceBrand || ''} ${order.deviceModel || ''}`.trim() || '---';
      document.getElementById('print-device-serial').innerText = order.deviceSerial || '---';
      document.getElementById('print-device-password').innerText = order.devicePassword || '---';

      document.getElementById('print-service-problem').innerText = order.problem || '---';
      
      const diagnosisBlock = document.getElementById('print-diagnosis-block');
      if (order.diagnosis) {
        document.getElementById('print-service-diagnosis').innerText = order.diagnosis;
        diagnosisBlock.style.display = 'block';
      } else {
        diagnosisBlock.style.display = 'none';
      }

      document.getElementById('print-start-date').innerText = this.formatDateBr(order.startDate);
      document.getElementById('print-end-date').innerText = order.endDate ? this.formatDateBr(order.endDate) : 'Em execução';
      document.getElementById('print-warranty-days').innerText = order.warranty || 'Sem Garantia';
      
      document.getElementById('print-payment-status').innerText = this.translatePaymentStatus(order.paymentStatus).toUpperCase();
      document.getElementById('print-payment-method').innerText = order.paymentMethod ? this.translatePaymentMethod(order.paymentMethod) : 'Não informado';

      document.getElementById('print-parts-value').innerText = this.formatCurrency(order.partsValue);
      document.getElementById('print-labor-value').innerText = this.formatCurrency(order.laborValue);
      document.getElementById('print-total-value').innerText = this.formatCurrency(order.totalValue);

      document.getElementById('print-warranty-terms').innerText = company.warrantyTerms || 'Os termos de garantia cobrem apenas defeitos das peças listadas e substituídas nesta ordem de serviço.';

      const sigImg = document.getElementById('print-signature-img');
      if (order.signatureBytes) {
        sigImg.src = order.signatureBytes;
        sigImg.style.display = 'block';
      } else {
        sigImg.src = '';
        sigImg.style.display = 'none';
      }

      document.getElementById('os-print-modal').classList.add('active');

    } catch (err) {
      console.error(err);
      this.showToast('Erro ao renderizar ordem de serviço para visualização.', 'error');
    }
  },

  closePrintModal() {
    document.getElementById('os-print-modal').classList.remove('active');
    
    document.body.classList.remove('print-os-mode');
    if (this.originalTitle) {
      document.title = this.originalTitle;
    }
  },

  // --- CONTROLLER DE RELATÓRIOS E FINANCEIRO ---

  async initReportsView() {
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    
    if (!startInput.value || !endInput.value) {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const format = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      startInput.value = format(firstDay);
      endInput.value = format(today);
    }
    
    await this.renderReports();
  },

  async renderReports() {
    try {
      const startVal = document.getElementById('report-start-date').value;
      const endVal = document.getElementById('report-end-date').value;
      
      if (!startVal || !endVal) {
        this.showToast('Selecione as datas inicial e final para filtrar.', 'error');
        return;
      }

      const startDate = new Date(startVal + 'T00:00:00');
      const endDate = new Date(endVal + 'T23:59:59');

      const orders = await this.getAllOrders();

      const filtered = orders.filter(o => {
        if (!o.startDate) return false;
        const oDate = new Date(o.startDate);
        return oDate >= startDate && oDate <= endDate;
      });

      // Cálculos financeiros com Lucro Líquido
      let faturamento = 0; // OS Concluídas
      let lucroLíquido = 0; // Margem (Mão de Obra + (Venda Peça - Custo Peça))
      let recebido = 0;    // Pago
      let aReceber = 0;    // Concluída + Pendente

      const paymentSums = {
        'PIX': 0,
        'DINHEIRO': 0,
        'DEBITO': 0,
        'CREDITO': 0,
        'BOLETO': 0,
        'OUTRO': 0
      };

      filtered.forEach(o => {
        if (o.status === 'CANCELADO') return; // Ignorar OS canceladas nos totais financeiros

        const val = o.totalValue || 0;
        const labor = o.laborValue || 0;
        const partsSale = o.partsValue || 0;
        const partsCost = o.partsCostValue || 0; // Campo de custo

        if (o.status === 'CONCLUIDO') {
          faturamento += val;
          // Lucro = Mão de Obra + (Venda das Peças - Custo das Peças)
          const profit = labor + (partsSale - partsCost);
          lucroLíquido += profit;

          if (o.paymentStatus === 'PENDENTE') {
            aReceber += val;
          }
        }
        if (o.paymentStatus === 'PAGO') {
          recebido += val;
          // Agrupar recebimentos por forma de pagamento
          const method = (o.paymentMethod || '').toUpperCase();
          if (paymentSums.hasOwnProperty(method)) {
            paymentSums[method] += val;
          } else {
            paymentSums['OUTRO'] += val;
          }
        }
      });

      // Atualizar cards de métricas
      document.getElementById('report-revenue-total').innerText = this.formatCurrency(faturamento);
      document.getElementById('report-profit-total').innerText = this.formatCurrency(lucroLíquido);
      document.getElementById('report-revenue-paid').innerText = this.formatCurrency(recebido);
      document.getElementById('report-revenue-pending').innerText = this.formatCurrency(aReceber);

      // Renderizar o resumo de formas de pagamento
      const paymentSummaryContainer = document.getElementById('report-payment-methods-summary');
      if (paymentSummaryContainer) {
        paymentSummaryContainer.innerHTML = '';
        const methodNames = {
          'PIX': 'Pix',
          'DINHEIRO': 'Dinheiro',
          'DEBITO': 'Cartão Débito',
          'CREDITO': 'Cartão Crédito',
          'BOLETO': 'Boleto',
          'OUTRO': 'Outro / Não Inf.'
        };
        Object.keys(paymentSums).forEach(key => {
          const value = paymentSums[key];
          const chip = document.createElement('div');
          chip.className = 'payment-method-chip';
          chip.innerHTML = `
            <span class="method-label">${methodNames[key]}</span>
            <span class="method-value" style="${value > 0 ? 'color: var(--color-completed);' : ''}">${this.formatCurrency(value)}</span>
          `;
          paymentSummaryContainer.appendChild(chip);
        });
      }

      const formatDateStringBr = (str) => {
        const parts = str.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      };
      document.getElementById('report-period-display').innerText = `Período: ${formatDateStringBr(startVal)} até ${formatDateStringBr(endVal)}`;

      const tbody = document.getElementById('report-table-body');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" align="center" class="text-muted">Nenhum serviço registrado neste período.</td></tr>`;
        return;
      }

      filtered.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      filtered.forEach(o => {
        const tr = document.createElement('tr');
        const code = String(o.id).padStart(4, '0');
        
        const osStatusBadge = this.getStatusBadge(o.status);
        
        const payStatus = o.paymentStatus === 'PAGO' ? 'Pago' : 'Pendente';
        const payClass = o.paymentStatus === 'PAGO' ? 'badge-completed' : 'badge-cancelled';
        const payBadge = `<span class="badge ${payClass}">${payStatus}</span>`;
        
        const deviceText = `${o.deviceBrand} ${o.deviceModel}`;
        const dateText = o.endDate ? this.formatDateBr(o.endDate).split(' às ')[0] : (o.startDate ? this.formatDateBr(o.startDate).split(' às ')[0] : '---');

        tr.innerHTML = `
          <td><strong>#${code}</strong></td>
          <td>${o.customerName}</td>
          <td class="hide-mobile">${deviceText}</td>
          <td class="hide-mobile">${dateText}</td>
          <td>${osStatusBadge}</td>
          <td class="hide-mobile">${o.paymentMethod ? this.translatePaymentMethod(o.paymentMethod) : '---'}</td>
          <td>${payBadge}</td>
          <td>${this.formatCurrency(o.totalValue)}</td>
        `;
        tbody.appendChild(tr);
      });

    } catch (err) {
      console.error(err);
      this.showToast('Erro ao processar relatório financeiro.', 'error');
    }
  },

  printReport() {
    document.body.classList.add('print-report-mode');
    document.body.classList.remove('print-os-mode');
    const originalTitle = document.title;
    
    const start = document.getElementById('report-start-date').value || 'completo';
    const end = document.getElementById('report-end-date').value || 'completo';
    document.title = `Relatorio_Faturamento_${start}_a_${end}`;
    
    window.print();
    
    const cleanUp = () => {
      document.body.classList.remove('print-report-mode');
      document.title = originalTitle;
      window.removeEventListener('afterprint', cleanUp);
    };
    window.addEventListener('afterprint', cleanUp);
    setTimeout(cleanUp, 1000);
  },

  // --- TRADUÇÕES E UTILS ---

  translateStatus(status) {
    switch (status) {
      case 'PENDENTE': return 'Pendente';
      case 'EM_ANDAMENTO': return 'Em Andamento';
      case 'CONCLUIDO': return 'Concluído';
      case 'CANCELADO': return 'Cancelado';
      default: return status;
    }
  },

  getStatusBadge(status) {
    const label = this.translateStatus(status);
    const lower = status.toLowerCase().replace('_', '-');
    return `<span class="badge badge-${lower}">${label}</span>`;
  },

  translatePaymentStatus(status) {
    if (status === 'PAGO') return 'Pago';
    return 'Pendente';
  },

  translatePaymentMethod(method) {
    switch (method) {
      case 'PIX': return 'Pix';
      case 'DINHEIRO': return 'Dinheiro';
      case 'DEBITO': return 'Cartão de Débito';
      case 'CREDITO': return 'Cartão de Crédito';
      case 'BOLETO': return 'Boleto';
      case 'OUTRO': return 'Outro';
      default: return method || 'Não informado';
    }
  },

  formatCurrency(val) {
    const num = parseFloat(val);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatDateBr(dateTimeString) {
    if (!dateTimeString) return '---';
    const d = new Date(dateTimeString);
    if (isNaN(d.getTime())) return dateTimeString;
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  },

  formatDateTimeLocal(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date - tzOffset)).toISOString().slice(0, 16);
    return localISOTime;
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast-notification');
    const msgSpan = document.getElementById('toast-message');
    
    msgSpan.innerText = message;
    toast.className = 'notification';
    toast.classList.add(`notification-${type}`, 'show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }
};

// Iniciar quando o DOM estiver pronto
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
