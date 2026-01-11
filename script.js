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
        this.cacheElements();
        this.loadData();
        this.setupCanvas();
        this.setupEventListeners();
        this.updateUI();
    }
    
    cacheElements() {
        const ids = [
            'itemInput', 'weightInput', 'addBtn', 'spinBtn', 'clearBtn', 'shuffleBtn',
            'exportBtn', 'importBtn', 'confirmImportBtn', 'searchInput', 'copyResultBtn',
            'clearHistoryBtn', 'closeImportBtn', 'importModal', 
            'importTextarea', 'itemsList', 'historyList', 'statsGrid', 'resultDisplay'
        ];
        
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
        
        this.elements.resultText = document.querySelector('.result-text');
    }
    
    setupCanvas() {
        const size = 400;
        this.canvas.width = size;
        this.canvas.height = size;
        this.radius = size / 2;
        this.centerX = this.radius;
        this.centerY = this.radius;
    }
    
    setupEventListeners() {
        this.elements.addBtn.addEventListener('click', () => this.addItem());
        this.elements.itemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });
        this.elements.weightInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });
        this.elements.spinBtn.addEventListener('click', () => this.spin());
        this.elements.clearBtn.addEventListener('click', () => this.clearAll());
        this.elements.shuffleBtn.addEventListener('click', () => this.shuffleItems());
        this.elements.exportBtn.addEventListener('click', () => this.exportItems());
        this.elements.importBtn.addEventListener('click', () => this.showImportModal());
        this.elements.confirmImportBtn.addEventListener('click', () => this.importItems());
        this.elements.searchInput.addEventListener('input', this.debounce((e) => {
            this.filterItems(e.target.value);
        }, 200));
        this.elements.copyResultBtn.addEventListener('click', () => this.copyResult());
        this.elements.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        this.elements.closeImportBtn.addEventListener('click', () => this.hideImportModal());
        
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseInt(e.target.dataset.speed);
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.settings.animationDuration = 1000 + (11 - speed) * 400;
                this.saveSettings();
            });
        });
        
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        this.elements.importModal.addEventListener('click', (e) => {
            if (e.target.id === 'importModal') this.hideImportModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideImportModal();
                if (this.editingIndex !== null) {
                    this.cancelEdit();
                }
            }
        });
    }
    
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }
    
    addItem() {
        const text = this.elements.itemInput.value.trim();
        const weight = Math.max(1, Math.min(100, parseInt(this.elements.weightInput.value) || 1));
        
        if (!text) return;
        
        if (this.editingIndex !== null) {
            const actualIndex = this.items.findIndex((item) => this.filteredItems[this.editingIndex] === item);
            if (actualIndex !== -1) {
                this.items[actualIndex] = { text, weight };
                this.editingIndex = null;
            }
        } else {
            this.items.push({ text, weight });
        }
        
        this.elements.itemInput.value = '';
        this.elements.weightInput.value = '1';
        this.elements.itemInput.focus();
        this.saveData();
        this.updateUI();
    }
    
    editItem(index) {
        const item = this.filteredItems[index];
        if (!item) return;
        
        this.editingIndex = index;
        this.elements.itemInput.value = item.text;
        this.elements.weightInput.value = item.weight;
        this.elements.itemInput.focus();
        this.elements.addBtn.textContent = 'Save';
    }
    
    cancelEdit() {
        this.editingIndex = null;
        this.elements.itemInput.value = '';
        this.elements.weightInput.value = '1';
        this.elements.addBtn.textContent = 'Add';
    }
    
    removeItem(index) {
        const actualIndex = this.items.findIndex((item) => this.filteredItems[index] === item);
        if (actualIndex !== -1) {
            this.items.splice(actualIndex, 1);
            this.saveData();
            this.updateUI();
        }
    }
    
    removeHistoryItem(index) {
        this.history.splice(index, 1);
        this.saveData();
        this.updateHistory();
    }
    
    clearAll() {
        if (this.items.length === 0) return;
        if (confirm('Clear all options?')) {
            this.items = [];
            this.saveData();
            this.updateUI();
        }
    }
    
    shuffleItems() {
        if (this.items.length < 2) return;
        for (let i = this.items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
        }
        this.saveData();
        this.updateUI();
    }
    
    filterItems(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.updateItemsList();
    }
    
    exportItems() {
        if (this.items.length === 0) {
            alert('No items to export');
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
        } catch (error) {
            alert('Export failed. Please try again.');
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
        if (!content) return;
        
        try {
            const lines = content.split(/[\n,;]/).map(line => line.trim()).filter(line => line);
            const newItems = lines.map(line => {
                const parts = line.split('|');
                const text = parts[0].trim();
                const weight = Math.max(1, Math.min(100, parseInt(parts[1]) || 1));
                return { text, weight };
            }).filter(item => item.text);
            
            if (newItems.length === 0) {
                alert('No valid items found');
                return;
            }
            
            this.items = [...this.items, ...newItems];
            this.saveData();
            this.updateUI();
            this.hideImportModal();
        } catch (error) {
            alert('Import failed. Please check the format.');
        }
    }
    
    copyResult() {
        const resultText = this.elements.resultText.textContent;
        if (resultText && resultText !== 'Click Spin') {
            navigator.clipboard.writeText(resultText).then(() => {
                const btn = this.elements.copyResultBtn;
                const originalText = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }).catch(() => {
                alert('Failed to copy to clipboard');
            });
        }
    }
    
    clearHistory() {
        if (this.history.length === 0) return;
        if (confirm('Clear all history?')) {
            this.history = [];
            this.saveData();
            this.updateHistory();
        }
    }
    
    switchTab(tabName) {
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
            }
        }
    }
    
    updateUI() {
        this.updateItemsList();
        this.updateSpinButton();
        this.drawWheel();
    }
    
    updateItemsList() {
        if (this.items.length === 0) {
            this.elements.itemsList.innerHTML = '<p class="empty-state">Add options to choose from</p>';
            return;
        }
        
        this.filteredItems = this.searchQuery
            ? this.items.filter(item => item.text.toLowerCase().includes(this.searchQuery))
            : [...this.items];
        
        if (this.filteredItems.length === 0) {
            this.elements.itemsList.innerHTML = '<p class="empty-state">No options match your search</p>';
            return;
        }
        
        this.elements.itemsList.innerHTML = this.filteredItems.map((item, index) => {
            return `
                <div class="item">
                    <span class="item-text" onclick="app.editItem(${index})">
                        ${this.escapeHtml(item.text)}
                        ${item.weight > 1 ? `<span class="item-weight">×${item.weight}</span>` : ''}
                    </span>
                    <button class="item-delete" onclick="app.removeItem(${index})" aria-label="Delete">×</button>
                </div>
            `;
        }).join('');
    }
    
    updateSpinButton() {
        const validItems = this.items.filter(item => item.weight > 0);
        this.elements.spinBtn.disabled = validItems.length < 2 || this.isSpinning;
    }
    
    drawWheel() {
        const validItems = this.items.filter(item => item.weight > 0);
        
        if (validItems.length === 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        const totalWeight = validItems.reduce((sum, item) => sum + item.weight, 0);
        const colors = this.getColors(validItems.length);
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.centerX, this.centerY);
        this.ctx.rotate(this.currentRotation);
        
        let currentAngle = -Math.PI / 2;
        
        for (let i = 0; i < validItems.length; i++) {
            const item = validItems[i];
            const angle = (item.weight / totalWeight) * 2 * Math.PI;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, this.radius - 2, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fillStyle = colors[i];
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.save();
            this.ctx.rotate(startAngle + angle / 2);
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            
            const text = item.text;
            const maxWidth = this.radius * 0.65;
            const metrics = this.ctx.measureText(text);
            
            if (metrics.width > maxWidth) {
                const truncated = this.truncateText(text, maxWidth);
                this.ctx.fillText(truncated, this.radius * 0.28, 0);
            } else {
                this.ctx.fillText(text, this.radius * 0.28, 0);
            }
            
            this.ctx.restore();
            currentAngle = endAngle;
        }
        
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 26, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();
        this.ctx.strokeStyle = '#E5E5EA';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    getColors(count) {
        if (this.colorCache.has(count)) {
            return this.colorCache.get(count);
        }
        
        const colors = [];
        const hueStep = 360 / count;
        
        for (let i = 0; i < count; i++) {
            const hue = (i * hueStep) % 360;
            const saturation = 65 + (i % 4) * 8;
            const lightness = 55 + (i % 3) * 2;
            colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
        }
        
        this.colorCache.set(count, colors);
        return colors;
    }
    
    truncateText(text, maxWidth) {
        let truncated = text;
        let metrics = this.ctx.measureText(truncated);
        
        while (metrics.width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
            metrics = this.ctx.measureText(truncated + '...');
        }
        
        return truncated + (truncated.length < text.length ? '...' : '');
    }
    
    spin() {
        const validItems = this.items.filter(item => item.weight > 0);
        if (this.isSpinning || validItems.length < 2) return;
        
        this.isSpinning = true;
        this.updateSpinButton();
        
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
        const spins = 5 + Math.random() * 3;
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
            const easeOut = 1 - Math.pow(1 - progress, 3);
            
            this.currentRotation = startRotation + (this.targetRotation - startRotation) * easeOut;
            this.drawWheel();
            
            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.currentRotation = this.targetRotation;
                this.drawWheel();
                this.showResult(validItems[selectedIndex].text);
                this.isSpinning = false;
                this.updateSpinButton();
                
                if (this.settings.sound) {
                    this.playResultSound();
                }
            }
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    showResult(text) {
        this.elements.resultText.textContent = text;
        this.elements.copyResultBtn.style.display = 'block';
        this.elements.resultText.classList.add('winner');
        
        setTimeout(() => {
            this.elements.resultText.classList.remove('winner');
        }, 400);
        
        this.addToHistory(text);
        if (document.querySelector('.tab.active')?.dataset.tab === 'stats') {
            this.updateStats();
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
            })
        });
        
        if (this.history.length > 100) {
            this.history = this.history.slice(0, 100);
        }
        
        this.saveData();
        if (document.querySelector('.tab.active')?.dataset.tab === 'history') {
            this.updateHistory();
        }
    }
    
    updateHistory() {
        if (this.history.length === 0) {
            this.elements.historyList.innerHTML = '<p class="empty-state">No results yet</p>';
            return;
        }
        
        this.elements.historyList.innerHTML = this.history.map((item, index) => `
            <div class="history-item">
                <span class="history-item-text">${this.escapeHtml(item.text)}</span>
                <div class="history-item-right">
                    <span class="history-item-time">${item.time}</span>
                    <button class="history-delete" onclick="app.removeHistoryItem(${index})" aria-label="Delete">×</button>
                </div>
            </div>
        `).join('');
    }
    
    updateStats() {
        if (this.history.length === 0) {
            this.elements.statsGrid.innerHTML = '<p class="empty-state">No statistics available</p>';
            return;
        }
        
        const stats = {};
        this.history.forEach(item => {
            stats[item.text] = (stats[item.text] || 0) + 1;
        });
        
        const total = this.history.length;
        const sortedStats = Object.entries(stats)
            .map(([text, count]) => ({
                text,
                count,
                percentage: ((count / total) * 100).toFixed(1)
            }))
            .sort((a, b) => b.count - a.count);
        
        this.elements.statsGrid.innerHTML = sortedStats.map(stat => `
            <div class="stat-card">
                <div class="stat-card-name">${this.escapeHtml(stat.text)}</div>
                <div class="stat-card-value">${stat.count}</div>
                <div class="stat-card-percentage">${stat.percentage}%</div>
            </div>
        `).join('');
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
        if (this.settings.autoSave) {
            try {
                localStorage.setItem('randomizerItems', JSON.stringify(this.items));
                localStorage.setItem('randomizerHistory', JSON.stringify(this.history));
            } catch (error) {
            }
        }
    }
    
    loadData() {
        try {
            const savedItems = localStorage.getItem('randomizerItems');
            const savedHistory = localStorage.getItem('randomizerHistory');
            const savedSettings = localStorage.getItem('randomizerSettings');
            
            if (savedItems) {
                this.items = JSON.parse(savedItems);
            }
            
            if (savedHistory) {
                this.history = JSON.parse(savedHistory);
            }
            
            if (savedSettings) {
                const loaded = JSON.parse(savedSettings);
                this.settings.autoSave = loaded.autoSave !== undefined ? loaded.autoSave : true;
                this.settings.sound = loaded.sound !== undefined ? loaded.sound : true;
                this.settings.animationDuration = loaded.animationDuration || 3000;
                
                const speedValue = Math.round((this.settings.animationDuration - 1000) / 400);
                const speed = speedValue <= 3 ? 1 : speedValue <= 7 ? 5 : 10;
                document.querySelectorAll('.speed-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (parseInt(btn.dataset.speed) === speed) {
                        btn.classList.add('active');
                    }
                });
            }
        } catch (error) {
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('randomizerSettings', JSON.stringify(this.settings));
        } catch (error) {
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new RandomizerApp();
});
