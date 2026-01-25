class RandomizerApp {
    constructor() {
        this.items = [];
        this.history = [];
        this.settings = {
            autoSave: true,
            sound: true,
            animationDuration: 3000
        };
        this.isSpinning = false;
        this.currentRotation = 0;
        this.targetRotation = 0;
        this.filteredItems = [];
        this.searchQuery = '';
        this.colorCache = new Map();
        this.animationFrameId = null;
        this.editingIndex = null;
        
        this.canvas = document.getElementById('wheelCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.elements = {};
        
        this.init();
    }
    
    init() {
        try {
            this.cacheElements();
            this.loadData();
            this.setupCanvas();
            this.setupEventListeners();
            this.updateUI();
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }
    
    cacheElements() {
        const ids = [
            'itemInput', 'weightInput', 'addBtn', 'spinBtn', 'clearBtn', 'shuffleBtn',
            'exportBtn', 'importBtn', 'confirmImportBtn', 'searchInput', 'copyResultBtn',
            'clearHistoryBtn', 'closeImportBtn', 'importModal', 
            'importTextarea', 'itemsList', 'historyList', 'statsGrid', 'resultDisplay',
            'totalSpins', 'statsTotal', 'overviewTotal', 'overviewUnique', 'overviewMost', 'overview24h'
        ];
        
        ids.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements[id] = element;
            }
        });
        
        const resultText = document.querySelector('.result-text');
        if (resultText) {
            this.elements.resultText = resultText;
        }
        
        if (!this.canvas || !this.ctx) {
            throw new Error('Canvas element not found');
        }
    }
    
    setupCanvas() {
        const container = this.canvas.parentElement;
        if (!container) return;
        
        const containerWidth = container.clientWidth;
        const size = Math.min(containerWidth - 40, 420);
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.canvas.width = size;
        this.canvas.height = size;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        
        this.radius = size / 2;
        this.centerX = this.radius;
        this.centerY = this.radius;
        
        const dpr = window.devicePixelRatio || 1;
        if (dpr > 1) {
            this.canvas.width = size * dpr;
            this.canvas.height = size * dpr;
            this.canvas.style.width = size + 'px';
            this.canvas.style.height = size + 'px';
            this.ctx.scale(dpr, dpr);
            this.radius = size / 2;
            this.centerX = this.radius;
            this.centerY = this.radius;
        }
        
        this.drawWheel();
    }
    
    setupEventListeners() {
        this.eventListeners = [];
        
        const addListener = (element, event, handler) => {
            if (element) {
                element.addEventListener(event, handler);
                this.eventListeners.push({ element, event, handler });
            }
        };
        
        addListener(this.elements.addBtn, 'click', () => this.addItem());
        addListener(this.elements.itemInput, 'keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });
        addListener(this.elements.weightInput, 'keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });
        addListener(this.elements.spinBtn, 'click', () => this.spin());
        addListener(this.elements.clearBtn, 'click', () => this.clearAll());
        addListener(this.elements.shuffleBtn, 'click', () => this.shuffleItems());
        addListener(this.elements.exportBtn, 'click', () => this.exportItems());
        addListener(this.elements.importBtn, 'click', () => this.showImportModal());
        addListener(this.elements.confirmImportBtn, 'click', () => this.importItems());
        
        if (this.elements.searchInput) {
            const debouncedFilter = this.debounce((e) => {
                this.filterItems(e.target.value);
            }, 200);
            addListener(this.elements.searchInput, 'input', debouncedFilter);
        }
        
        addListener(this.elements.copyResultBtn, 'click', () => this.copyResult());
        addListener(this.elements.closeImportBtn, 'click', () => this.hideImportModal());
        addListener(this.elements.clearHistoryBtn, 'click', () => this.clearHistory());
        
        document.querySelectorAll('.speed-btn').forEach(btn => {
            const handler = (e) => {
                const speed = parseInt(e.target.dataset.speed);
                if (isNaN(speed)) return;
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.settings.animationDuration = 1000 + (11 - speed) * 400;
                this.saveSettings();
            };
            addListener(btn, 'click', handler);
        });
        
        addListener(this.elements.importModal, 'click', (e) => {
            if (e.target.id === 'importModal') this.hideImportModal();
        });
        
        document.querySelectorAll('.tab').forEach(tab => {
            const handler = (e) => {
                const tabName = e.target.dataset.tab;
                if (tabName) this.switchTab(tabName);
            };
            addListener(tab, 'click', handler);
        });
        
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                this.hideImportModal();
                if (this.editingIndex !== null) {
                    this.cancelEdit();
                }
            }
        };
        addListener(document, 'keydown', keyHandler);
        
        this.resizeHandler = this.debounce(() => {
            this.setupCanvas();
            this.drawWheel();
        }, 250);
        addListener(window, 'resize', this.resizeHandler);
    }
    
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    addItem() {
        if (!this.elements.itemInput || !this.elements.weightInput) return;
        
        const text = this.elements.itemInput.value.trim();
        const weight = Math.max(1, Math.min(100, parseInt(this.elements.weightInput.value) || 1));
        
        if (!text) {
            this.showInputError(this.elements.itemInput, 'Please enter an option');
            return;
        }
        
        if (text.length > 100) {
            this.showInputError(this.elements.itemInput, 'Option must be less than 100 characters');
            return;
        }
        
        const isDuplicate = this.items.some(item => item.text.toLowerCase() === text.toLowerCase());
        if (isDuplicate && this.editingIndex === null) {
            this.showInputError(this.elements.itemInput, 'This option already exists');
            return;
        }
        
        try {
            if (this.editingIndex !== null) {
                const actualIndex = this.items.findIndex((item) => {
                    return this.filteredItems[this.editingIndex] && 
                           this.filteredItems[this.editingIndex] === item;
                });
                if (actualIndex !== -1) {
                    this.items[actualIndex] = { text, weight };
                    this.editingIndex = null;
                    if (this.elements.addBtn) {
                        this.elements.addBtn.textContent = 'Add';
                        this.elements.addBtn.classList.remove('btn-editing');
                    }
                    this.showNotification('Option updated successfully', 'success');
                }
            } else {
                this.items.push({ text, weight });
                this.showNotification('Option added successfully', 'success');
            }
            
            this.elements.itemInput.value = '';
            this.elements.weightInput.value = '1';
            this.clearInputError(this.elements.itemInput);
            this.elements.itemInput.focus();
            this.saveData();
            this.updateUI();
        } catch (error) {
            console.error('Error adding item:', error);
            this.showNotification('Failed to add option', 'error');
        }
    }
    
    editItem(index) {
        if (!this.elements.itemInput || !this.elements.weightInput || !this.elements.addBtn) return;
        
        const item = this.filteredItems[index];
        if (!item) return;
        
        try {
            this.editingIndex = index;
            this.elements.itemInput.value = item.text || '';
            this.elements.weightInput.value = item.weight || 1;
            this.elements.itemInput.focus();
            this.elements.addBtn.textContent = 'Save';
            this.elements.addBtn.classList.add('btn-editing');
            this.clearInputError(this.elements.itemInput);
        } catch (error) {
            console.error('Error editing item:', error);
            this.showNotification('Failed to edit option', 'error');
        }
    }
    
    cancelEdit() {
        if (!this.elements.itemInput || !this.elements.weightInput || !this.elements.addBtn) return;
        
        this.editingIndex = null;
        this.elements.itemInput.value = '';
        this.elements.weightInput.value = '1';
        this.elements.addBtn.textContent = 'Add';
        this.elements.addBtn.classList.remove('btn-editing');
        this.clearInputError(this.elements.itemInput);
    }
    
    removeItem(index) {
        const actualIndex = this.items.findIndex((item) => this.filteredItems[index] === item);
        if (actualIndex !== -1) {
            const item = this.items[actualIndex];
            this.items.splice(actualIndex, 1);
            this.saveData();
            this.updateUI();
            this.showNotification(`"${item.text}" removed`, 'success');
        }
    }
    
    removeHistoryItem(index) {
        if (!this.history || index < 0 || index >= this.history.length) return;
        
        this.history.splice(index, 1);
        this.saveData();
        this.updateHistory();
        const activeTab = document.querySelector('.tab.active')?.dataset.tab;
        if (activeTab === 'stats') {
            this.updateStats();
        }
    }
    
    clearHistory() {
        if (!this.history || this.history.length === 0) return;
        
        if (confirm('Clear all history? This cannot be undone.')) {
            this.history = [];
            this.saveData();
            this.updateHistory();
            const activeTab = document.querySelector('.tab.active')?.dataset.tab;
            if (activeTab === 'stats') {
                this.updateStats();
            }
        }
    }
    
    switchTab(tabName) {
        if (!tabName || !['wheel', 'history', 'stats'].includes(tabName)) return;
        
        try {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            const tabElement = document.querySelector(`[data-tab="${tabName}"]`);
            const contentElement = document.getElementById(`${tabName}Tab`);
            
            if (tabElement && contentElement) {
                tabElement.classList.add('active');
                contentElement.classList.add('active');
                
                if (tabName === 'stats') {
                    this.updateStats();
                } else if (tabName === 'history') {
                    this.updateHistory();
                } else if (tabName === 'wheel') {
                    this.drawWheel();
                }
            }
        } catch (error) {
            console.error('Error switching tab:', error);
            this.showNotification('Failed to switch tab', 'error');
        }
    }
    
    clearAll() {
        if (this.items.length === 0) {
            this.showNotification('No options to clear', 'info');
            return;
        }
        if (confirm('Clear all options? This cannot be undone.')) {
            this.items = [];
            this.saveData();
            this.updateUI();
            this.showNotification('All options cleared', 'success');
        }
    }
    
    shuffleItems() {
        if (this.items.length < 2) {
            this.showNotification('Need at least 2 options to shuffle', 'info');
            return;
        }
        for (let i = this.items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
        }
        this.saveData();
        this.updateUI();
        this.showNotification('Options shuffled', 'success');
    }
    
    filterItems(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.updateItemsList();
    }
    
    exportItems() {
        if (this.items.length === 0) {
            this.showNotification('No options to export', 'info');
            return;
        }
        try {
            const data = this.items.map(item => `${item.text}|${item.weight}`).join('\n');
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `randomizer-export-${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showNotification('Options exported successfully', 'success');
        } catch (error) {
            this.showNotification('Export failed. Please try again.', 'error');
        }
    }
    
    showImportModal() {
        this.elements.importModal.classList.add('active');
        this.elements.importTextarea.value = '';
        setTimeout(() => this.elements.importTextarea.focus(), 100);
    }
    
    hideImportModal() {
        this.elements.importModal.classList.remove('active');
    }
    
    importItems() {
        const content = this.elements.importTextarea.value.trim();
        if (!content) {
            this.showInputError(this.elements.importTextarea, 'Please enter options to import');
            return;
        }
        
        try {
            const lines = content.split(/[\n,;]/).map(line => line.trim()).filter(line => line);
            const newItems = lines.map(line => {
                const parts = line.split('|');
                const text = parts[0].trim();
                const weight = Math.max(1, Math.min(100, parseInt(parts[1]) || 1));
                return { text, weight };
            }).filter(item => item.text);
            
            if (newItems.length === 0) {
                this.showInputError(this.elements.importTextarea, 'No valid items found');
                return;
            }
            
            this.items = [...this.items, ...newItems];
            this.saveData();
            this.updateUI();
            this.hideImportModal();
            this.showNotification(`Imported ${newItems.length} options successfully`, 'success');
        } catch (error) {
            this.showInputError(this.elements.importTextarea, 'Import failed. Please check the format.');
        }
    }
    
    copyResult() {
        if (!this.elements.resultText) return;
        
        const resultText = this.elements.resultText.textContent;
        if (resultText && resultText !== 'Click Spin') {
            navigator.clipboard.writeText(resultText).then(() => {
                const btn = this.elements.copyResultBtn;
                if (!btn) return;
                
                const originalText = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }).catch(() => {
                this.showNotification('Failed to copy to clipboard', 'error');
            });
        }
    }
    
    updateUI() {
        requestAnimationFrame(() => {
            this.updateItemsList();
            this.updateSpinButton();
            this.updateActionButtons();
            this.drawWheel();
        });
    }
    
    updateItemsList() {
        if (!this.elements.itemsList) return;
        
        if (!this.items || this.items.length === 0) {
            this.elements.itemsList.innerHTML = '<p class="empty-state">Add options to choose from</p>';
            this.filteredItems = [];
            return;
        }
        
        try {
            const searchQuery = this.searchQuery;
            this.filteredItems = searchQuery
                ? this.items.filter(item => item && item.text && item.text.toLowerCase().includes(searchQuery))
                : [...this.items].filter(item => item && item.text);
            
            if (this.filteredItems.length === 0) {
                this.elements.itemsList.innerHTML = '<p class="empty-state">No options match your search</p>';
                return;
            }
            
            const fragment = document.createDocumentFragment();
            
            this.filteredItems.forEach((item, index) => {
                const safeText = item && item.text ? this.escapeHtml(item.text) : '';
                const weight = item && item.weight ? item.weight : 1;
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'item';
                itemDiv.innerHTML = `
                    <span class="item-text" onclick="app.editItem(${index})">
                        ${safeText}
                        ${weight > 1 ? `<span class="item-weight">×${weight}</span>` : ''}
                    </span>
                    <button class="item-delete" onclick="app.removeItem(${index})" aria-label="Delete">×</button>
                `;
                fragment.appendChild(itemDiv);
            });
            
            this.elements.itemsList.innerHTML = '';
            this.elements.itemsList.appendChild(fragment);
        } catch (error) {
            console.error('Error updating items list:', error);
            this.elements.itemsList.innerHTML = '<p class="empty-state">Error loading items</p>';
        }
    }
    
    updateSpinButton() {
        if (!this.elements.spinBtn) return;
        
        const validItems = (this.items || []).filter(item => item && item.weight > 0);
        const shouldDisable = validItems.length < 2 || this.isSpinning;
        
        this.elements.spinBtn.disabled = shouldDisable;
        this.elements.spinBtn.textContent = this.isSpinning ? 'Spinning...' : 'Spin';
    }
    
    updateActionButtons() {
        if (!this.elements.clearBtn || !this.elements.shuffleBtn || !this.elements.exportBtn) return;
        
        const hasItems = this.items && this.items.length > 0;
        
        this.elements.clearBtn.disabled = !hasItems;
        this.elements.shuffleBtn.disabled = !hasItems || this.items.length < 2;
        this.elements.exportBtn.disabled = !hasItems;
    }
    
    drawWheel() {
        if (!this.canvas || !this.ctx) return;
        
        const validItems = (this.items || []).filter(item => item && item.weight > 0);
        
        if (validItems.length === 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        const totalWeight = validItems.reduce((sum, item) => sum + (item.weight || 0), 0);
        if (totalWeight <= 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        const colors = this.getColors(validItems.length);
        const actualRadius = this.radius;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.centerX, this.centerY);
        this.ctx.rotate(this.currentRotation);
        
        let currentAngle = -Math.PI / 2;
        
        for (let i = 0; i < validItems.length; i++) {
            const item = validItems[i];
            if (!item || !item.text) continue;
            
            const weight = item.weight || 1;
            const angle = (weight / totalWeight) * 2 * Math.PI;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, actualRadius - 3, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = colors[i] || '#CCCCCC';
            this.ctx.fill();
            
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.save();
            this.ctx.rotate(startAngle + angle / 2);
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto';
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            this.ctx.shadowBlur = 4;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 1;
            
            const text = String(item.text || '');
            const maxWidth = actualRadius * 0.6;
            const metrics = this.ctx.measureText(text);
            
            if (metrics.width > maxWidth) {
                const truncated = this.truncateText(text, maxWidth);
                this.ctx.fillText(truncated, actualRadius * 0.25, 0);
            } else {
                this.ctx.fillText(text, actualRadius * 0.25, 0);
            }
            
            this.ctx.restore();
            currentAngle = endAngle;
        }
        
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 28, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    getColors(count) {
        if (this.colorCache.has(count)) {
            return this.colorCache.get(count);
        }
        
        const colors = [];
        const baseHue = 220;
        const hueSpread = 280;
        
        for (let i = 0; i < count; i++) {
            const hue = (baseHue + (i * hueSpread / count)) % 360;
            const saturation = 70 + (i % 3) * 10;
            const lightness = 50 + (i % 4) * 5;
            colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
        }
        
        this.colorCache.set(count, colors);
        return colors;
    }
    
    truncateText(text, maxWidth) {
        if (!this.ctx || !text) return text || '';
        
        let truncated = text;
        let metrics = this.ctx.measureText(truncated);
        
        while (metrics.width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
            metrics = this.ctx.measureText(truncated + '...');
        }
        
        return truncated + (truncated.length < text.length ? '...' : '');
    }
    
    spin() {
        const validItems = this.items.filter(item => item && item.weight > 0);
        if (this.isSpinning || validItems.length < 2) {
            if (validItems.length < 2) {
                this.showNotification('Need at least 2 options to spin', 'info');
            }
            return;
        }
        
        this.isSpinning = true;
        this.updateUI();
        
        const totalWeight = validItems.reduce((sum, item) => sum + item.weight, 0);
        const random = Math.random() * totalWeight;
        
        let selectedIndex = 0;
        let accumulatedWeight = 0;
        
        for (let i = 0; i < validItems.length; i++) {
            accumulatedWeight += validItems[i].weight;
            if (random <= accumulatedWeight) {
                selectedIndex = i;
                break;
            }
        }
        
        let currentAngle = -Math.PI / 2;
        for (let i = 0; i < selectedIndex; i++) {
            currentAngle += (validItems[i].weight / totalWeight) * 2 * Math.PI;
        }
        
        const selectedAngle = currentAngle + (validItems[selectedIndex].weight / totalWeight) * Math.PI;
        const spins = 6 + Math.random() * 4;
        this.targetRotation = this.currentRotation + (spins * 2 * Math.PI) + (Math.PI - selectedAngle);
        
        const startTime = performance.now();
        const duration = this.settings.animationDuration;
        const startRotation = this.currentRotation;
        
        if (this.settings.sound) {
            this.playSpinSound();
        }
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            let easeProgress;
            if (progress < 0.8) {
                easeProgress = (progress / 0.8) * (progress / 0.8);
            } else {
                const deceleration = (progress - 0.8) / 0.2;
                easeProgress = 1 - (1 - deceleration) * (1 - deceleration) * (1 - deceleration);
            }
            
            this.currentRotation = startRotation + (this.targetRotation - startRotation) * easeProgress;
            this.drawWheel();
            
            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.currentRotation = this.targetRotation;
                this.drawWheel();
                this.showResult(validItems[selectedIndex].text);
                this.isSpinning = false;
                this.updateUI();
                
                if (this.settings.sound) {
                    this.playResultSound();
                }
            }
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    showResult(text) {
        if (!text || !this.elements.resultText) return;
        
        try {
            if (this.elements.resultText) {
                this.elements.resultText.textContent = text;
            }
            if (this.elements.copyResultBtn) {
                this.elements.copyResultBtn.style.display = 'block';
            }
            if (this.elements.resultText) {
                this.elements.resultText.classList.add('winner');
            }
            
            setTimeout(() => {
                if (this.elements && this.elements.resultText) {
                    this.elements.resultText.classList.remove('winner');
                }
            }, 400);
            
            this.addToHistory(text);
            const activeTab = document.querySelector('.tab.active')?.dataset.tab;
            if (activeTab === 'stats') {
                this.updateStats();
            }
        } catch (error) {
            console.error('Error showing result:', error);
        }
    }
    
    addToHistory(text) {
        const now = new Date();
        this.history.unshift({
            text,
            time: now.toLocaleString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            timestamp: now.getTime()
        });
        
        if (this.history.length > 1000) {
            this.history = this.history.slice(0, 1000);
        }
        
        this.saveData();
        if (document.querySelector('.tab.active')?.dataset.tab === 'history') {
            this.updateHistory();
        }
        if (document.querySelector('.tab.active')?.dataset.tab === 'stats') {
            this.updateStats();
        }
    }
    
    updateHistory() {
        if (!this.elements.historyList) return;
        
        if (!this.history || this.history.length === 0) {
            this.elements.historyList.innerHTML = '<p class="empty-state">No results yet</p>';
            if (this.elements.totalSpins) {
                this.elements.totalSpins.textContent = '0';
            }
            return;
        }
        
        try {
            if (this.elements.totalSpins) {
                this.elements.totalSpins.textContent = this.history.length;
            }
            
            const fragment = document.createDocumentFragment();
            
            this.history.forEach((item, index) => {
                if (!item || !item.text) return;
                
                const stats = this.calculateItemStats(item.text);
                const safeText = this.escapeHtml(item.text);
                const safeTime = item.time || '';
                
                const historyDiv = document.createElement('div');
                historyDiv.className = 'history-item';
                historyDiv.innerHTML = `
                    <div class="history-item-info">
                        <span class="history-item-text">${safeText}</span>
                        <span class="history-item-time">${safeTime}</span>
                        ${stats.count > 1 ? `<span class="history-item-count">Appeared ${stats.count} times</span>` : ''}
                    </div>
                    <button class="history-delete" onclick="app.removeHistoryItem(${index})" aria-label="Delete">×</button>
                `;
                fragment.appendChild(historyDiv);
            });
            
            this.elements.historyList.innerHTML = '';
            this.elements.historyList.appendChild(fragment);
        } catch (error) {
            console.error('Error updating history:', error);
            this.elements.historyList.innerHTML = '<p class="empty-state">Error loading history</p>';
        }
    }
    
    calculateItemStats(text) {
        const count = this.history.filter(item => item.text === text).length;
        const percentage = this.history.length > 0 ? ((count / this.history.length) * 100).toFixed(1) : 0;
        return { count, percentage };
    }
    
    updateStats() {
        if (!this.elements.statsGrid) return;
        
        if (!this.history || this.history.length === 0) {
            this.elements.statsGrid.innerHTML = '<p class="empty-state">No statistics available</p>';
            this.updateOverviewStats({});
            if (this.elements.statsTotal) {
                this.elements.statsTotal.textContent = '0';
            }
            return;
        }
        
        try {
            const stats = {};
            const now = Date.now();
            const last24h = now - (24 * 60 * 60 * 1000);
            let count24h = 0;
            
            this.history.forEach(item => {
                if (item && item.text) {
                    stats[item.text] = (stats[item.text] || 0) + 1;
                    if (item.timestamp && typeof item.timestamp === 'number' && item.timestamp >= last24h) {
                        count24h++;
                    }
                }
            });
            
            const total = this.history.length;
            const unique = Object.keys(stats).length;
            const sortedStats = Object.entries(stats)
                .map(([text, count]) => ({
                    text: text || '',
                    count: Number(count) || 0,
                    percentage: total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
                }))
                .filter(stat => stat.text)
                .sort((a, b) => b.count - a.count);
            
            const mostFrequent = sortedStats.length > 0 ? sortedStats[0].text : '—';
            
            this.updateOverviewStats({
                total,
                unique,
                mostFrequent,
                count24h
            });
            
            if (this.elements.statsTotal) {
                this.elements.statsTotal.textContent = total;
            }
            
            const maxCount = sortedStats.length > 0 ? sortedStats[0].count : 1;
            
            this.elements.statsGrid.innerHTML = sortedStats.map((stat, index) => {
                const barWidth = maxCount > 0 ? (stat.count / maxCount) * 100 : 0;
                const safeText = this.escapeHtml(stat.text);
                return `
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-name">${safeText}</span>
                            <span class="stat-card-rank">#${index + 1}</span>
                        </div>
                        <div class="stat-card-body">
                            <div class="stat-card-main">
                                <span class="stat-card-value">${stat.count}</span>
                                <span class="stat-card-label">times</span>
                            </div>
                            <div class="stat-card-percentage">${stat.percentage}%</div>
                        </div>
                        <div class="stat-card-bar">
                            <div class="stat-card-bar-fill" style="width: ${barWidth}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error updating stats:', error);
            this.elements.statsGrid.innerHTML = '<p class="empty-state">Error loading statistics</p>';
        }
    }
    
    updateOverviewStats({ total = 0, unique = 0, mostFrequent = '—', count24h = 0 }) {
        if (this.elements.overviewTotal) {
            this.elements.overviewTotal.textContent = total;
        }
        if (this.elements.overviewUnique) {
            this.elements.overviewUnique.textContent = unique;
        }
        if (this.elements.overviewMost) {
            this.elements.overviewMost.textContent = mostFrequent.length > 20 ? mostFrequent.substring(0, 20) + '...' : mostFrequent;
        }
        if (this.elements.overview24h) {
            this.elements.overview24h.textContent = count24h;
        }
    }
    
    playSpinSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 180;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.12);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.12);
        } catch (error) {
        }
    }
    
    playResultSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 440;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.35);
        } catch (error) {
        }
    }
    
    saveData() {
        if (!this.settings.autoSave) return;
        
        try {
            const itemsData = JSON.stringify(this.items || []);
            const historyData = JSON.stringify(this.history || []);
            
            localStorage.setItem('randomizerItems', itemsData);
            localStorage.setItem('randomizerHistory', historyData);
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('Storage quota exceeded. Clearing old data...');
                this.history = this.history.slice(0, 100);
                try {
                    localStorage.setItem('randomizerItems', JSON.stringify(this.items || []));
                    localStorage.setItem('randomizerHistory', JSON.stringify(this.history || []));
                } catch (retryError) {
                    console.error('Failed to save after cleanup:', retryError);
                    this.showNotification('Storage full. Please clear some data.', 'error');
                }
            } else {
                console.error('Save error:', error);
            }
        }
    }
    
    loadData() {
        try {
            const savedItems = localStorage.getItem('randomizerItems');
            const savedHistory = localStorage.getItem('randomizerHistory');
            const savedSettings = localStorage.getItem('randomizerSettings');
            
            if (savedItems) {
                try {
                    const parsed = JSON.parse(savedItems);
                    this.items = Array.isArray(parsed) ? parsed.filter(item => item && item.text) : [];
                } catch (parseError) {
                    console.error('Error parsing items:', parseError);
                    this.items = [];
                }
            }
            
            if (savedHistory) {
                try {
                    const parsed = JSON.parse(savedHistory);
                    this.history = Array.isArray(parsed) ? parsed.filter(item => item && item.text) : [];
                } catch (parseError) {
                    console.error('Error parsing history:', parseError);
                    this.history = [];
                }
            }
            
            if (savedSettings) {
                try {
                    const loaded = JSON.parse(savedSettings);
                    if (loaded && typeof loaded === 'object') {
                        this.settings.autoSave = loaded.autoSave !== undefined ? Boolean(loaded.autoSave) : true;
                        this.settings.sound = loaded.sound !== undefined ? Boolean(loaded.sound) : true;
                        this.settings.animationDuration = Number(loaded.animationDuration) || 3000;
                        
                        const speedValue = Math.round((this.settings.animationDuration - 1000) / 400);
                        const speed = speedValue <= 3 ? 1 : speedValue <= 7 ? 5 : 10;
                        
                        setTimeout(() => {
                            document.querySelectorAll('.speed-btn').forEach(btn => {
                                if (btn && btn.dataset.speed) {
                                    btn.classList.remove('active');
                                    if (parseInt(btn.dataset.speed) === speed) {
                                        btn.classList.add('active');
                                    }
                                }
                            });
                        }, 100);
                    }
                } catch (parseError) {
                    console.error('Error parsing settings:', parseError);
                }
            }
        } catch (error) {
            console.error('Load error:', error);
            this.items = [];
            this.history = [];
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('randomizerSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Settings save error:', error);
        }
    }
    
    cleanup() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.eventListeners) {
            this.eventListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            this.eventListeners = [];
        }
        
        if (this.colorCache) {
            this.colorCache.clear();
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
    
    showNotification(message, type = 'success') {
        return;
    }
    
    showInputError(input, message) {
        input.style.borderColor = 'var(--accent-danger)';
        input.style.boxShadow = '0 0 0 3px rgba(255, 69, 58, 0.1)';
        
        let errorElement = input.parentNode.querySelector('.input-error');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'input-error';
            errorElement.style.cssText = `
                color: var(--accent-danger);
                font-size: 12px;
                margin-top: 4px;
                font-weight: 500;
            `;
            input.parentNode.appendChild(errorElement);
        }
        errorElement.textContent = message;
        
        input.addEventListener('input', () => this.clearInputError(input), { once: true });
    }
    
    clearInputError(input) {
        input.style.borderColor = '';
        input.style.boxShadow = '';
        const errorElement = input.parentNode.querySelector('.input-error');
        if (errorElement) {
            errorElement.remove();
        }
    }
    
    downloadAsFile(data, filename, type = 'text/plain') {
        const blob = new Blob([data], { type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
    
    parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim());
        const result = [];
        
        for (const line of lines) {
            const parts = line.split(',').map(part => part.trim());
            if (parts.length >= 2) {
                result.push({
                    text: parts[0].replace(/^"|"$/g, ''),
                    weight: parseInt(parts[1]) || 1
                });
            } else if (parts.length === 1) {
                result.push({
                    text: parts[0].replace(/^"|"$/g, ''),
                    weight: 1
                });
            }
        }
        
        return result;
    }
    
    exportToCSV() {
        const csv = this.items.map(item => 
            `"${item.text.replace(/"/g, '""')}",${item.weight}`
        ).join('\n');
        this.downloadAsFile(csv, 'randomizer-items.csv', 'text/csv');
    }
    
    validateInput(text, weight) {
        const errors = [];
        
        if (!text || text.trim().length === 0) {
            errors.push('Item text is required');
        }
        
        if (weight && (isNaN(weight) || weight < 1 || weight > 100)) {
            errors.push('Weight must be between 1 and 100');
        }
        
        if (text && text.length > 100) {
            errors.push('Item text must be less than 100 characters');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    searchItems(query) {
        if (!query) return this.items;
        
        const lowerQuery = query.toLowerCase();
        return this.items.filter(item => 
            item.text.toLowerCase().includes(lowerQuery)
        );
    }
    
    sortByWeight(items) {
        return [...items].sort((a, b) => b.weight - a.weight);
    }
    
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    calculateStatistics() {
        if (this.history.length === 0) return null;
        
        const stats = {
            totalSpins: this.history.length,
            uniqueItems: new Set(this.history.map(h => h.text)).size,
            averageSpinsPerDay: this.calculateAverageSpinsPerDay(),
            mostRecent: this.history[0],
            timeSpan: this.calculateTimeSpan()
        };
        
        return stats;
    }
    
    calculateAverageSpinsPerDay() {
        if (this.history.length === 0) return 0;
        
        const dates = [...new Set(this.history.map(h => 
            new Date(h.time).toDateString()
        ))];
        
        return (this.history.length / dates.length).toFixed(1);
    }
    
    calculateTimeSpan() {
        if (this.history.length < 2) return 'N/A';
        
        const first = new Date(this.history[this.history.length - 1].time);
        const last = new Date(this.history[0].time);
        const diff = last - first;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Same day';
        if (days === 1) return '1 day';
        return `${days} days`;
    }
    
    resetSettings() {
        this.settings = {
            autoSave: true,
            sound: true,
            animationDuration: 3000
        };
        this.saveSettings();
        this.showNotification('Settings reset to default');
    }
    
    exportHistory() {
        const data = this.history.map((item, index) => 
            `${index + 1},"${item.text}","${item.time}"`
        ).join('\n');
        this.downloadAsFile(data, 'randomizer-history.csv', 'text/csv');
    }
    
    importFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const extension = file.name.split('.').pop().toLowerCase();
                
                if (extension === 'csv') {
                    const items = this.parseCSV(content);
                    this.items = items;
                    this.updateUI();
                    this.showNotification(`Imported ${items.length} items from CSV`);
                } else {
                    const lines = content.split('\n').filter(line => line.trim());
                    const items = lines.map(line => ({
                        text: line,
                        weight: 1
                    }));
                    this.items = items;
                    this.updateUI();
                    this.showNotification(`Imported ${items.length} items from text file`);
                }
            } catch (error) {
                this.showNotification('Import failed: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
    }
    
    getCurrentDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    createBackup() {
        try {
            const backup = {
                items: this.items || [],
                history: this.history || [],
                settings: this.settings || {},
                timestamp: new Date().toISOString()
            };
            
            const data = JSON.stringify(backup, null, 2);
            this.downloadAsFile(data, `randomizer-backup-${this.getCurrentDate()}.json`, 'application/json');
            if (this.showNotification) {
                this.showNotification('Backup created successfully');
            }
        } catch (error) {
            console.error('Backup error:', error);
            this.showNotification('Failed to create backup', 'error');
        }
    }
    
    restoreFromBackup(data) {
        try {
            const backup = JSON.parse(data);
            
            if (backup.items) this.items = backup.items;
            if (backup.history) this.history = backup.history;
            if (backup.settings) this.settings = { ...this.settings, ...backup.settings };
            
            this.saveData();
            this.updateUI();
            this.showNotification('Backup restored successfully');
        } catch (error) {
            this.showNotification('Restore failed: ' + error.message, 'error');
        }
    }
    
    getTheme() {
        return localStorage.getItem('randomizer-theme') || 'light';
    }
    
    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('randomizer-theme', theme);
        this.showNotification(`Theme changed to ${theme}`);
    }
    
    toggleDarkMode() {
        const currentTheme = this.getTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
    
    animateNumber(element, start, end, duration = 1000) {
        const startTime = performance.now();
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = start + (end - start) * this.easeOutQuad(progress);
            element.textContent = Math.round(current);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    easeOutQuad(t) {
        return t * (2 - t);
    }
    
    formatNumber(num) {
        return new Intl.NumberFormat('en-US').format(num);
    }
    
    getLocalStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            total += localStorage[key].length;
        }
        return this.formatFileSize(total);
    }
    
    clearAllData() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            this.items = [];
            this.history = [];
            localStorage.clear();
            this.updateUI();
            this.showNotification('All data cleared');
        }
    }
}

let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new RandomizerApp();
});
