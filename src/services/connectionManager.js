import { APIError } from './api';

class ConnectionManager {
  constructor() {
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo inicial
    this.maxRetryDelay = 30000; // 30 segundos máximo
    this.isOnline = navigator.onLine;
    this.listeners = new Set();
    
    // Escuchar eventos de conexión
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  handleOnline() {
    this.isOnline = true;
    this.retryAttempts = 0;
    this.notifyListeners('online');
  }

  handleOffline() {
    this.isOnline = false;
    this.notifyListeners('offline');
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(status) {
    this.listeners.forEach(callback => callback(status));
  }

  async executeWithRetry(operation, context = '') {
    if (!this.isOnline) {
      throw new APIError('Sin conexión a internet', 0);
    }

    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.retryAttempts = 0; // Reset en éxito
        return result;
      } catch (error) {
        lastError = error;
        
        // No reintentar para errores 4xx (excepto 408)
        if (error.status >= 400 && error.status < 500 && error.status !== 408) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          const delay = Math.min(
            this.retryDelay * Math.pow(2, attempt), 
            this.maxRetryDelay
          );
          
          console.warn(`${context} falló (intento ${attempt + 1}/${this.maxRetries + 1}). Reintentando en ${delay}ms...`, error);
          
          await this.sleep(delay);
          this.retryAttempts = attempt + 1;
        }
      }
    }
    
    throw new APIError(
      `${context} falló después de ${this.maxRetries + 1} intentos: ${lastError.message}`,
      lastError.status || 0,
      { originalError: lastError, attempts: this.maxRetries + 1 }
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRetryInfo() {
    return {
      attempts: this.retryAttempts,
      maxRetries: this.maxRetries,
      isOnline: this.isOnline
    };
  }
}

export default new ConnectionManager();