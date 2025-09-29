class N8nWorkflowManager {
  constructor() {
    this.apiUrl = '';
    this.apiKey = '';
    this.workflows = [];
    this.folderColors = new Map(); // Store folder colors by path
    this.init();
  }

  async init() {
    console.log('Initializing n8n Workflow Explorer...');
    await this.loadConfig();
    await this.loadDarkMode();
    this.bindEvents();
    
    if (this.apiUrl && this.apiKey) {
      console.log('Config found, showing main section');
      this.showMainSection();
      await this.loadWorkflows();
    } else {
      console.log('No config found, showing setup section');
    }
  }

  async loadConfig() {
    try {
      const result = await chrome.storage.local.get(['n8n_api_url', 'n8n_api_key', 'folder_colors']);
      this.apiUrl = result.n8n_api_url || '';
      this.apiKey = result.n8n_api_key || '';
      
      // Load folder colors
      if (result.folder_colors) {
        this.folderColors = new Map(Object.entries(result.folder_colors));
      }
      
      console.log('Loaded config - URL:', this.apiUrl ? 'Set' : 'Not set', 'Key:', this.apiKey ? 'Set' : 'Not set');
      console.log('Loaded folder colors:', this.folderColors.size, 'entries');
      
    } catch (error) {
      console.error('Error loading config:', error);
      this.apiUrl = '';
      this.apiKey = '';
      this.folderColors = new Map();
    }
  }

  async loadDarkMode() {
    try {
      const result = await chrome.storage.local.get(['dark_mode']);
      const isDarkMode = result.dark_mode || false;
      
      if (isDarkMode) {
        document.body.classList.add('dark-mode');
      }
      
      // Update checkbox state
      const toggle = document.getElementById('dark-mode-toggle');
      if (toggle) {
        toggle.checked = isDarkMode;
      }
      
      console.log('Dark mode loaded:', isDarkMode);
    } catch (error) {
      console.error('Error loading dark mode:', error);
    }
  }

  async toggleDarkMode() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const newDarkMode = !isDarkMode;
    
    if (newDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    // Save to storage
    await chrome.storage.local.set({ dark_mode: newDarkMode });
    
    console.log('Dark mode toggled:', newDarkMode);
  }

  bindEvents() {
    document.getElementById('open-config').addEventListener('click', () => this.showConfigSection());
    document.getElementById('refresh-workflows').addEventListener('click', () => this.loadWorkflows());
    document.getElementById('open-settings').addEventListener('click', () => this.showConfigSection());
    
    // Config form events
    document.getElementById('back-to-setup').addEventListener('click', () => this.showSetupSection());
    document.getElementById('config-form').addEventListener('submit', (e) => this.handleConfigSubmit(e));
    
    // Dark mode toggle event
    document.getElementById('dark-mode-toggle').addEventListener('change', () => this.toggleDarkMode());
    
    // Listen for storage changes (when config is updated)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && (changes.n8n_api_url || changes.n8n_api_key)) {
        this.loadConfig().then(() => {
          if (this.apiUrl && this.apiKey) {
            this.showMainSection();
            this.loadWorkflows();
          }
        });
      }
    });
  }



  showConfigSection() {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('main-section').style.display = 'none';
    document.getElementById('config-section').style.display = 'block';
    
    // Mevcut ayarları yükle
    chrome.storage.local.get(['n8n_api_url', 'n8n_api_key', 'dark_mode'], (result) => {
      if (result.n8n_api_url) {
        document.getElementById('api-url').value = result.n8n_api_url;
      }
      if (result.n8n_api_key) {
        document.getElementById('api-key').value = result.n8n_api_key;
      }
      
      // Dark mode toggle durumunu ayarla
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      if (darkModeToggle) {
        darkModeToggle.checked = result.dark_mode || false;
      }
    });
  }

  showMainSection() {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('config-section').style.display = 'none';
    document.getElementById('main-section').style.display = 'block';
  }

  showSetupSection() {
    document.getElementById('setup-section').style.display = 'block';
    document.getElementById('config-section').style.display = 'none';
    document.getElementById('main-section').style.display = 'none';
  }

  async loadWorkflows() {
    if (!this.apiUrl || !this.apiKey) {
      this.showSetupSection();
      return;
    }

    this.showLoading(true);
    this.hideError();

    try {
      console.log('Loading workflows from:', this.apiUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(`${this.apiUrl}/api/v1/workflows`, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        if (response.status === 401) {
          errorMessage = 'Invalid API key. Please check your settings.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please check your API key permissions.';
        } else if (response.status === 404) {
          errorMessage = 'API endpoint not found. Please check your n8n URL.';
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Raw API response:', data);
      console.log('Response type:', typeof data);
      console.log('Response keys:', Object.keys(data));
      
      // Handle different response formats
      let workflows = [];
      if (Array.isArray(data)) {
        workflows = data;
      } else if (data.data && Array.isArray(data.data)) {
        workflows = data.data;
      } else if (data.workflows && Array.isArray(data.workflows)) {
        workflows = data.workflows;
      } else {
        console.warn('Unexpected response format:', data);
        workflows = [];
      }
      
      console.log('Extracted workflows:', workflows);
      console.log('Workflow count:', workflows.length);
      
      this.workflows = workflows;
      
      // Save workflows to storage for caching
      await chrome.storage.local.set({ 
        n8n_workflows: this.workflows,
        n8n_last_sync: new Date().toISOString()
      });
      
      this.renderWorkflows();
      
      if (this.workflows.length === 0) {
        this.showError('No workflows found in your n8n instance.');
      } else {
        console.log('Successfully loaded', this.workflows.length, 'workflows');
      }
      
    } catch (error) {
      console.error('Failed to load workflows:', error);
      
      let errorMessage = 'Failed to load workflows: ';
      
      if (error.name === 'AbortError') {
        errorMessage += 'Request timeout. Please check your connection.';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage += 'Network error. Please check if your n8n instance is accessible.';
      } else {
        errorMessage += error.message;
      }
      
      this.showError(errorMessage);
      
      // Try to load from cache
      const result = await chrome.storage.local.get(['n8n_workflows', 'n8n_last_sync']);
      if (result.n8n_workflows && result.n8n_workflows.length > 0) {
        this.workflows = result.n8n_workflows;
        this.renderWorkflows();
        
        const lastSync = result.n8n_last_sync ? 
          new Date(result.n8n_last_sync).toLocaleString() : 'Unknown';
        this.showError(`${errorMessage}\n\nShowing cached data from: ${lastSync}`);
      } else {
        // Show empty state with helpful message
        const container = document.getElementById('workflows-container');
        container.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: #666;">
            <div style="font-size: 48px; margin-bottom: 20px;">📋</div>
            <h3 style="margin: 0 0 10px 0; color: #333;">No Workflows Found</h3>
            <p style="margin: 0 0 20px 0;">Unable to load workflows from your n8n instance.</p>
            <button class="btn" onclick="document.getElementById('test-connection').click()" style="width: auto; padding: 8px 16px;">
              🔗 Test API Connection
            </button>
          </div>
        `;
      }
    } finally {
      this.showLoading(false);
    }
  }

  organizeWorkflowsByTags() {
    console.log('🏗️ Organizing', this.workflows.length, 'workflows by tags');
    const folderStructure = new Map();
    const untaggedWorkflows = [];
    const archivedWorkflows = [];

    this.workflows.forEach((workflow, index) => {
      console.log(`📋 Processing workflow ${index + 1}: "${workflow.name}"`);
      console.log('  Tags:', workflow.tags?.map(t => `${t.name} (${t.createdAt})`));
      console.log('  isArchived:', workflow.isArchived);
      
      // First check if workflow is archived
      if (workflow.isArchived) {
        console.log('  🗄️ Adding to archived');
        archivedWorkflows.push(workflow);
        return;
      }
      
      if (!workflow.tags || workflow.tags.length === 0) {
        console.log('  ➡️ Adding to untagged');
        untaggedWorkflows.push(workflow);
        return;
      }

      // Sort tags by createdAt to establish hierarchy
      const sortedTags = [...workflow.tags].sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      
      console.log('  📂 Sorted tags:', sortedTags.map(t => t.name));

      // Build folder path based on tag hierarchy
      let currentPath = '';
      let parentFolder = folderStructure;

      sortedTags.forEach((tag, tagIndex) => {
        const isLast = tagIndex === sortedTags.length - 1;
        currentPath = currentPath ? `${currentPath}/${tag.name}` : tag.name;
        
        console.log(`    📁 Processing tag "${tag.name}" (${tagIndex + 1}/${sortedTags.length}), isLast: ${isLast}, path: ${currentPath}`);

        if (!parentFolder.has(tag.name)) {
          console.log(`    ✨ Creating new folder: "${tag.name}"`);
          parentFolder.set(tag.name, {
            id: tag.id,
            name: tag.name,
            createdAt: tag.createdAt,
            path: currentPath,
            children: new Map(),
            workflows: []
          });
        }

        const folder = parentFolder.get(tag.name);
        
        if (isLast) {
          console.log(`    📋 Adding workflow "${workflow.name}" to folder "${tag.name}"`);
          folder.workflows.push(workflow);
        }

        parentFolder = folder.children;
      });
    });

    console.log('🎯 Final folder structure:');
    this.logFolderStructure(folderStructure, 0);
    console.log('🗄️ Archived workflows:', archivedWorkflows.length);
    
    return { folderStructure, untaggedWorkflows, archivedWorkflows };
  }

  logFolderStructure(folderMap, level) {
    const indent = '  '.repeat(level);
    folderMap.forEach((folder, name) => {
      console.log(`${indent}📁 ${name} (${folder.workflows.length} workflows, ${folder.children.size} children)`);
      if (folder.children.size > 0) {
        this.logFolderStructure(folder.children, level + 1);
      }
    });
  }

  renderWorkflows() {
    console.log('Rendering workflows...', this.workflows);
    const container = document.getElementById('workflows-container');
    const { folderStructure, untaggedWorkflows, archivedWorkflows } = this.organizeWorkflowsByTags();

    console.log('Folder structure:', folderStructure);
    console.log('Untagged workflows:', untaggedWorkflows);
    console.log('Archived workflows:', archivedWorkflows);

    container.innerHTML = '';

    // Render archived workflows first (at the top)
    if (archivedWorkflows.length > 0) {
      console.log('Creating archived folder with', archivedWorkflows.length, 'workflows');
      const archivedFolder = this.createFolderElement({
        name: 'Archived',
        path: 'Archived',
        workflows: archivedWorkflows,
        children: new Map()
      }, 0);
      container.appendChild(archivedFolder);
    }

    // Render folder structure
    this.renderFolderLevel(container, folderStructure, 0);

    // Render untagged workflows directly at the main level (same as folders)
    if (untaggedWorkflows.length > 0) {
      console.log('Rendering', untaggedWorkflows.length, 'untagged workflows at main level');
      untaggedWorkflows.forEach(workflow => {
        const workflowElement = this.createWorkflowElement(workflow, 0);
        container.appendChild(workflowElement);
      });
    }

    if (folderStructure.size === 0 && untaggedWorkflows.length === 0 && archivedWorkflows.length === 0) {
      console.log('No workflows to display');
      container.innerHTML = '<div class="loading">No workflows found</div>';
    } else {
      console.log('Rendered successfully - Folders:', folderStructure.size, 'Untagged:', untaggedWorkflows.length, 'Archived:', archivedWorkflows.length);
    }
  }

  renderFolderLevel(container, folderMap, level) {
    console.log(`Rendering folder level ${level} with ${folderMap.size} folders`);
    
    // Sort folders by createdAt
    const sortedFolders = Array.from(folderMap.values()).sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    sortedFolders.forEach(folder => {
      console.log(`Rendering folder: "${folder.name}" at level ${level}`);
      const folderElement = this.createFolderElement(folder, level);
      
      // Auto-open only top-level folders (level 0)
      if (level === 0) {
        console.log(`Auto-opening top-level folder: "${folder.name}"`);
        folderElement.classList.add('open');
        
        // Update visual indicators
        setTimeout(() => {
          const toggleElement = folderElement.querySelector('.folder-toggle');
          if (toggleElement && toggleElement.classList.contains('bi-chevron-right')) {
            toggleElement.className = toggleElement.className.replace('bi-chevron-right', 'bi-chevron-down');
          }
          // Klasör icon'u değişmeyecek, aynı kalacak (bi-folder-fill)
        }, 0);
      }
      
      container.appendChild(folderElement);
    });
  }

  createFolderElement(folder, level) {
    console.log(`Creating folder element: "${folder.name}" at level ${level}, hasChildren: ${folder.children && folder.children.size > 0}, hasWorkflows: ${folder.workflows && folder.workflows.length > 0}`);
    
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder';
    
    // Add color class and path attribute
    const folderPath = folder.path || folder.name;
    const folderColor = this.getFolderColor(folderPath);
    folderDiv.classList.add(`folder-color-${folderColor}`);
    folderDiv.setAttribute('data-folder-path', folderPath);
    
    const header = document.createElement('div');
    header.className = 'folder-header';
    header.style.paddingLeft = `${20 + (level * 20)}px`;
    
    const hasChildren = folder.children && folder.children.size > 0;
    const hasWorkflows = folder.workflows && folder.workflows.length > 0;
    const isExpandable = hasChildren || hasWorkflows;
    
    console.log(`Folder "${folder.name}" isExpandable: ${isExpandable}, hasChildren: ${hasChildren}, hasWorkflows: ${hasWorkflows}`);
    
    // Create elements individually for better control
    const headerContent = document.createElement('div');
    headerContent.style.cssText = 'display: flex; align-items: center;';
    
    const toggleSpan = document.createElement('i');
    toggleSpan.className = `bi ${isExpandable ? 'bi-chevron-right' : ''} folder-toggle`;
    toggleSpan.style.cssText = 'width: 12px; display: inline-block; margin-right: 8px; user-select: none; font-size: 12px;';
    
    const iconSpan = document.createElement('i');
    iconSpan.className = 'bi bi-folder-fill folder-icon';
    iconSpan.style.cssText = 'margin-right: 8px; font-size: 16px;';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = folder.name;
    
    headerContent.appendChild(toggleSpan);
    headerContent.appendChild(iconSpan);
    headerContent.appendChild(nameSpan);
    
    const countSpan = document.createElement('span');
    countSpan.className = 'folder-count';
    countSpan.style.cssText = 'font-size: 12px; color: #666;';
    countSpan.textContent = (folder.workflows ? folder.workflows.length : 0) + 
      (folder.children ? this.countWorkflowsInChildren(folder.children) : 0);
    
    header.appendChild(headerContent);
    header.appendChild(countSpan);

    const content = document.createElement('div');
    content.className = 'folder-content';

    // Add child folders first
    if (hasChildren) {
      console.log(`Adding children to folder "${folder.name}"`);
      this.renderFolderLevel(content, folder.children, level + 1);
    }

    // Add workflows
    if (hasWorkflows) {
      console.log(`Adding ${folder.workflows.length} workflows to folder "${folder.name}"`);
      folder.workflows.forEach(workflow => {
        const workflowElement = this.createWorkflowElement(workflow, level + 1);
        content.appendChild(workflowElement);
      });
    }

    folderDiv.appendChild(header);
    folderDiv.appendChild(content);

    // Add toggle functionality to all expandable folders
    if (isExpandable) {
      header.style.cursor = 'pointer';
      
      // Create unique handler function for this folder
      const folderId = `folder-${level}-${folder.name.replace(/\s+/g, '-')}`;
      folderDiv.setAttribute('data-folder-id', folderId);
      
      const handleToggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`🔄 Toggle clicked for folder: "${folder.name}" at level ${level} (ID: ${folderId})`);
        console.log('Current classList:', folderDiv.classList.toString());
        
        const isCurrentlyOpen = folderDiv.classList.contains('open');
        console.log(`Currently open: ${isCurrentlyOpen}`);
        
        if (isCurrentlyOpen) {
          console.log(`⬇️ Closing folder: "${folder.name}"`);
          folderDiv.classList.remove('open');
          toggleSpan.className = toggleSpan.className.replace('bi-chevron-down', 'bi-chevron-right');
          // Klasör icon'u aynı kalacak (bi-folder-fill)
        } else {
          console.log(`⬆️ Opening folder: "${folder.name}"`);
          folderDiv.classList.add('open');
          toggleSpan.className = toggleSpan.className.replace('bi-chevron-right', 'bi-chevron-down');
          // Klasör icon'u aynı kalacak (bi-folder-fill)
        }
        
        console.log('After toggle classList:', folderDiv.classList.toString());
      };
      
      // Add event listeners
      header.addEventListener('click', handleToggle, { capture: false });
      
      // Also add keyboard support
      header.setAttribute('tabindex', '0');
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle(e);
        }
      });
      
      console.log(`✅ Event listeners added to folder "${folder.name}" at level ${level}`);
    } else {
      console.log(`❌ No event listeners added to folder "${folder.name}" (not expandable)`);
    }

    // Add color customization to folder icon
    iconSpan.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove any existing menus
      document.querySelectorAll('.folder-color-menu').forEach(menu => menu.remove());
      
      const currentColor = this.getFolderColor(folderPath);
      const menu = this.createColorMenu(folderPath, currentColor);
      
      // Position menu
      menu.style.left = `${e.pageX}px`;
      menu.style.top = `${e.pageY}px`;
      
      document.body.appendChild(menu);
      menu.classList.add('show');
      
      // Close menu when clicking outside
      const closeMenu = (event) => {
        if (!menu.contains(event.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      
      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 0);
    });

    return folderDiv;
  }

  countWorkflowsInChildren(childrenMap) {
    let count = 0;
    childrenMap.forEach(child => {
      count += child.workflows ? child.workflows.length : 0;
      if (child.children) {
        count += this.countWorkflowsInChildren(child.children);
      }
    });
    return count;
  }

  createWorkflowElement(workflow, level) {
    const workflowDiv = document.createElement('div');
    workflowDiv.className = 'workflow-item';
    
    // Workflow'lar folder toggle'ları ile aynı hizada olmalı
    // Base padding: 20px (folder base) + 20px (toggle + icon space) = 40px
    // Her level için +20px
    const basePadding = 40;
    const levelPadding = level * 20;
    workflowDiv.style.paddingLeft = `${basePadding + levelPadding}px`;

    const date = new Date(workflow.createdAt).toLocaleDateString();
    const statusClass = workflow.active ? 'active' : 'inactive';
    const statusTitle = workflow.active ? 'Active' : 'Inactive';

    const workflowIcon = 'bi-node-minus-fill';
    const iconColor = workflow.active ? '#198754' : '#6c757d';
    const archiveIcon = workflow.isArchived ? '<i class="bi bi-archive" style="margin-left: 6px; color: #6c757d;"></i>' : '';
    
    workflowDiv.innerHTML = `
      <i class="bi ${workflowIcon} workflow-icon" style="font-size: 16px; color: ${iconColor}; margin-right: 12px;"></i>
      <div class="workflow-info">
        <div class="workflow-name">${workflow.name} ${archiveIcon}</div>
        <div class="workflow-meta">
          Created: ${date}
          ${workflow.isArchived ? ' • Archived' : ''}
        </div>
      </div>
      <div class="workflow-status ${statusClass}" title="${statusTitle}"></div>
    `;

    // Click to open workflow
    workflowDiv.addEventListener('click', () => {
      const workflowUrl = `${this.apiUrl}/workflow/${workflow.id}`;
      window.open(workflowUrl, '_blank');
    });

    return workflowDiv;
  }

  showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
  }

  showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  hideError() {
    document.getElementById('error-message').style.display = 'none';
  }

  showSuccess(message) {
    // First hide any existing error
    this.hideError();
    
    const existingSuccess = document.querySelector('.success');
    if (existingSuccess) {
      existingSuccess.remove();
    }

    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    
    const content = document.querySelector('.content');
    const firstSection = content.querySelector('#setup-section, #main-section');
    content.insertBefore(successDiv, firstSection);

    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.remove();
      }
    }, 4000);
  }

  async saveFolderColor(folderPath, color) {
    try {
      this.folderColors.set(folderPath, color);
      
      // Convert Map to object for storage
      const colorsObject = Object.fromEntries(this.folderColors);
      await chrome.storage.local.set({ folder_colors: colorsObject });
      
      console.log(`Saved color "${color}" for folder "${folderPath}"`);
    } catch (error) {
      console.error('Error saving folder color:', error);
    }
  }

  getFolderColor(folderPath) {
    return this.folderColors.get(folderPath) || 'default';
  }

  createColorMenu(folderPath, currentColor) {
    const menu = document.createElement('div');
    menu.className = 'folder-color-menu';
    
    const colors = [
      { name: 'Default', value: 'default' },
      { name: 'Primary', value: 'primary' },
      { name: 'Success', value: 'success' },
      { name: 'Info', value: 'info' },
      { name: 'Warning', value: 'warning' },
      { name: 'Danger', value: 'danger' },
      { name: 'Purple', value: 'purple' },
      { name: 'Pink', value: 'pink' },
      { name: 'Orange', value: 'orange' },
      { name: 'Teal', value: 'teal' }
    ];
    
    // Create color grid container
    const colorGrid = document.createElement('div');
    colorGrid.className = 'color-grid';
    
    colors.forEach(color => {
      const option = document.createElement('div');
      option.className = `color-option color-option-${color.value}`;
      option.title = color.name;
      
      if (color.value === currentColor) {
        option.classList.add('selected');
      }
      
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.saveFolderColor(folderPath, color.value);
        this.updateFolderColor(folderPath, color.value);
        menu.remove();
      });
      
      colorGrid.appendChild(option);
    });
    
    menu.appendChild(colorGrid);
    
    // Add a small text at the bottom
    const helpText = document.createElement('div');
    helpText.style.cssText = 'font-size: 11px; color: #666; text-align: center; margin-top: 4px;';
    helpText.textContent = 'Right-click folder icon to change color';
    menu.appendChild(helpText);
    
    return menu;
  }

  updateFolderColor(folderPath, newColor) {
    // Find only the specific folder with exact path match
    const folders = document.querySelectorAll(`[data-folder-path="${folderPath}"]`);
    folders.forEach(folder => {
      console.log(`🎨 Updating color for folder: "${folderPath}" to "${newColor}"`);
      // Remove old color classes
      folder.className = folder.className.replace(/folder-color-\w+/g, '');
      // Add new color class
      folder.classList.add(`folder-color-${newColor}`);
    });
  }

  async handleConfigSubmit(e) {
    e.preventDefault();
    
    const apiUrl = document.getElementById('api-url').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    
    if (!apiUrl || !apiKey) {
      this.showConfigError('Please fill in all fields.');
      return;
    }

    // Show loading
    document.getElementById('config-loading').style.display = 'block';
    document.getElementById('config-error-message').style.display = 'none';
    document.getElementById('config-success-message').style.display = 'none';
    
    try {
      // Test connection
      const response = await fetch(`${apiUrl}/api/v1/workflows`, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        if (response.status === 401) {
          errorMessage = 'Invalid API key. Please check your settings.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please check your API key permissions.';
        } else if (response.status === 404) {
          errorMessage = 'API endpoint not found. Please check your n8n URL.';
        }
        
        throw new Error(errorMessage);
      }

      // Save configuration
      await chrome.storage.local.set({
        n8n_api_url: apiUrl,
        n8n_api_key: apiKey
      });

      // Update instance variables
      this.apiUrl = apiUrl;
      this.apiKey = apiKey;

      // Show success and switch to main view
      this.showConfigSuccess('Configuration saved successfully!');
      
      setTimeout(() => {
        this.showMainSection();
        this.loadWorkflows();
      }, 1500);

    } catch (error) {
      console.error('Config test error:', error);
      this.showConfigError(error.message || 'Failed to connect to n8n. Please check your settings.');
    } finally {
      document.getElementById('config-loading').style.display = 'none';
    }
  }

  showConfigError(message) {
    const errorEl = document.getElementById('config-error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    document.getElementById('config-success-message').style.display = 'none';
  }

  showConfigSuccess(message) {
    const successEl = document.getElementById('config-success-message');
    successEl.textContent = message;
    successEl.style.display = 'block';
    document.getElementById('config-error-message').style.display = 'none';
  }
}

// Initialize the extension when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new N8nWorkflowManager();
});