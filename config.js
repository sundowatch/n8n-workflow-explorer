class N8nConfig {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadExistingConfig();
    this.bindEvents();
  }

  async loadExistingConfig() {
    try {
      const result = await chrome.storage.local.get(['n8n_api_url', 'n8n_api_key']);
      
      if (result.n8n_api_url) {
        document.getElementById('api-url').value = result.n8n_api_url;
      }
      if (result.n8n_api_key) {
        document.getElementById('api-key').value = result.n8n_api_key;
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  bindEvents() {
    const form = document.getElementById('config-form');
    const cancelBtn = document.getElementById('cancel-config');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveConfig();
    });

    cancelBtn.addEventListener('click', () => {
      window.close();
    });

    // Auto-focus first empty field
    const urlField = document.getElementById('api-url');
    const keyField = document.getElementById('api-key');
    
    if (!urlField.value) {
      urlField.focus();
    } else if (!keyField.value) {
      keyField.focus();
    }
  }

  async saveConfig() {
    const apiUrl = document.getElementById('api-url').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    const saveBtn = document.getElementById('save-config');

    if (!apiUrl || !apiKey) {
      this.showError('Please enter both API URL and API Key');
      return;
    }

    // Clean URL - remove trailing slash
    const cleanUrl = apiUrl.replace(/\/$/, '');

    // Validate URL format
    try {
      new URL(cleanUrl);
    } catch (error) {
      this.showError('Please enter a valid URL (including https://)');
      return;
    }

    // Show loading state
    this.showLoading(true);
    saveBtn.disabled = true;
    this.hideMessages();

    try {
      // Test the connection
      console.log('Testing connection to:', cleanUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${cleanUrl}/api/v1/workflows`, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        if (response.status === 401) {
          errorMessage = 'Invalid API key. Please check your credentials.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please check your API key permissions.';
        } else if (response.status === 404) {
          errorMessage = 'n8n API not found. Please check your URL.';
        }
        
        throw new Error(errorMessage);
      }

      // Test if response is valid JSON
      const data = await response.json();
      console.log('Connection test successful. Response keys:', Object.keys(data));
      console.log('Sample response data:', data);

      // Save configuration
      await chrome.storage.local.set({
        n8n_api_url: cleanUrl,
        n8n_api_key: apiKey
      });

      this.showSuccess('✅ Configuration saved successfully!');
      
      // Close window after success
      setTimeout(() => {
        window.close();
      }, 1500);

    } catch (error) {
      console.error('Connection test failed:', error);
      
      let errorMessage = 'Connection failed: ';
      
      if (error.name === 'AbortError') {
        errorMessage += 'Request timeout. Please check your URL and network connection.';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage += 'Network error. Please check if the URL is accessible and CORS is configured.';
      } else {
        errorMessage += error.message;
      }
      
      this.showError(errorMessage);
    } finally {
      this.showLoading(false);
      saveBtn.disabled = false;
    }
  }

  showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
  }

  showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }

  showSuccess(message) {
    const successDiv = document.getElementById('success-message');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
  }

  hideMessages() {
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('success-message').style.display = 'none';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new N8nConfig();
});