// barra.js - Sistema genérico de gerenciamento da barra (com sub-containers)

class ToolbarManager {
    constructor() {
        this.toolbarContainer = null;
        this.availableSlots = new Map();
        this.availableSubSlots = new Map(); // NOVO: Para sub-slots
        this.loadedPlugins = new Map();
        this.init();
    }

    async init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.loadToolbar());
        } else {
            this.loadToolbar();
        }
    }

    async loadToolbar() {
        try {
            this.toolbarContainer = document.getElementById('toolbar-container');
            
            if (!this.toolbarContainer) {
                console.error('Container da barra não encontrado');
                return;
            }

            // Cria os 6 slots vazios
            this.createSlots();
            
            console.log('✅ Barra genérica carregada - 6 slots disponíveis (slot 3 com sub-containers)');
            
        } catch (error) {
            console.error('❌ Erro ao carregar a barra:', error);
        }
    }

    createSlots() {
        let slotsHTML = '';
        
        for (let i = 1; i <= 6; i++) {
            // NOVO: Slot 3 tem sub-containers especiais
            if (i === 3) {
                slotsHTML += `
                    <div class="plugin-slot combo-slot" data-slot="${i}" id="plugin-slot-${i}">
                        <div class="sub-container left-side" data-sub="left" id="plugin-slot-${i}-left">
                            <div class="plugin-container"></div>
                        </div>
                        <div class="sub-container right-side" data-sub="right" id="plugin-slot-${i}-right">
                            <div class="plugin-container"></div>
                        </div>
                    </div>
                `;
                
                // Registra slot principal como ocupado (mas sub-slots estão disponíveis)
                this.availableSlots.set(i, false);
                this.availableSubSlots.set(`${i}-left`, true);
                this.availableSubSlots.set(`${i}-right`, true);
            } else {
                // Slots normais
                slotsHTML += `
                    <div class="plugin-slot empty" data-slot="${i}" id="plugin-slot-${i}">
                        <div class="plugin-container"></div>
                    </div>
                `;
                
                // Registra slot como disponível
                this.availableSlots.set(i, true);
            }
        }
        
        this.toolbarContainer.innerHTML = slotsHTML;
        
        console.log('🎯 6 slots criados (slot 3 com sub-containers left/right)');
    }

    // NOVO: Método para registrar em sub-slots
    registerPlugin(pluginName, slotId, pluginInstance, htmlContent) {
        // Verifica se é um sub-slot (formato "3-left" ou "3-right")
        if (typeof slotId === 'string' && slotId.includes('-')) {
            return this.registerInSubSlot(pluginName, slotId, pluginInstance, htmlContent);
        }
        
        // Lógica original para slots normais
        if (!this.availableSlots.get(slotId)) {
            console.error(`❌ Slot ${slotId} não disponível`);
            return false;
        }

        const slot = document.getElementById(`plugin-slot-${slotId}`);
        if (!slot) {
            console.error(`❌ Slot ${slotId} não encontrado`);
            return false;
        }

        const container = slot.querySelector('.plugin-container');
        container.innerHTML = htmlContent;
        
        slot.classList.remove('empty');
        this.availableSlots.set(slotId, false);
        
        this.loadedPlugins.set(`${pluginName}-${slotId}`, pluginInstance);
        
        console.log(`✅ Plugin ${pluginName} registrado no slot ${slotId}`);
        return true;
    }

    // NOVO: Registra plugin em sub-slot
    registerInSubSlot(pluginName, subSlotId, pluginInstance, htmlContent) {
        if (!this.availableSubSlots.get(subSlotId)) {
            console.error(`❌ Sub-slot ${subSlotId} não disponível`);
            return false;
        }

        const subSlot = document.getElementById(`plugin-slot-${subSlotId}`);
        if (!subSlot) {
            console.error(`❌ Sub-slot ${subSlotId} não encontrado`);
            return false;
        }

        const container = subSlot.querySelector('.plugin-container');
        container.innerHTML = htmlContent;
        
        subSlot.classList.remove('empty');
        this.availableSubSlots.set(subSlotId, false);
        
        this.loadedPlugins.set(`${pluginName}-${subSlotId}`, pluginInstance);
        
        console.log(`✅ Plugin ${pluginName} registrado no sub-slot ${subSlotId}`);
        return true;
    }

    // Método para remover plugin (atualizado para sub-slots)
    unregisterPlugin(pluginName, slotId) {
        const pluginKey = `${pluginName}-${slotId}`;
        const plugin = this.loadedPlugins.get(pluginKey);
        
        if (plugin) {
            // Determina se é sub-slot
            const isSubSlot = typeof slotId === 'string' && slotId.includes('-');
            const slotElement = document.getElementById(`plugin-slot-${slotId}`);
            
            if (slotElement) {
                slotElement.classList.add('empty');
                slotElement.querySelector('.plugin-container').innerHTML = '';
            }
            
            // Marca como disponível
            if (isSubSlot) {
                this.availableSubSlots.set(slotId, true);
            } else {
                this.availableSlots.set(slotId, true);
            }
            
            this.loadedPlugins.delete(pluginKey);
            
            if (typeof plugin.destroy === 'function') {
                plugin.destroy();
            }
            
            console.log(`🗑️ Plugin ${pluginName} removido do ${isSubSlot ? 'sub-slot' : 'slot'} ${slotId}`);
            return true;
        }
        
        return false;
    }

    // Métodos utilitários atualizados
    getAvailableSlots() {
        const available = [];
        this.availableSlots.forEach((isAvailable, slotId) => {
            if (isAvailable) {
                available.push(slotId);
            }
        });
        
        // Adiciona sub-slots disponíveis
        this.availableSubSlots.forEach((isAvailable, subSlotId) => {
            if (isAvailable) {
                available.push(subSlotId);
            }
        });
        
        return available;
    }

    isSlotAvailable(slotId) {
        // Verifica sub-slot
        if (typeof slotId === 'string' && slotId.includes('-')) {
            return this.availableSubSlots.get(slotId) === true;
        }
        
        // Verifica slot normal
        return this.availableSlots.get(slotId) === true;
    }

    getLoadedPlugins() {
        return Array.from(this.loadedPlugins.keys());
    }
}

// Inicializa o gerenciador da barra (genérico)
const toolbar = new ToolbarManager();

// Torna disponível globalmente para plugins se registrarem
window.toolbar = toolbar;