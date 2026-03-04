class SupabaseSync {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.isOnline = navigator.onLine;
        this.initPromise = null;
        this.initPromise = this.init();
    }

    async init() {
        try {
            if (typeof supabase === 'undefined') {
                await this.loadSupabaseLibrary();
            }
            const { createClient } = supabase;
            this.supabase = createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey 
            );
            this.checkExistingSession();
            this.setupNetworkMonitoring();
            return true;
        } catch (error) {
            return false;
        }
    }

    loadSupabaseLibrary() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    checkExistingSession() {
        try {
            const savedUser = localStorage.getItem('supabase_user');
            this.currentUser = savedUser ? JSON.parse(savedUser) : null;
        } catch (error) {
            this.currentUser = null;
        }
    }

    setupNetworkMonitoring() {
        window.addEventListener('online', () => { this.isOnline = true; });
        window.addEventListener('offline', () => { this.isOnline = false; });
    }

    async ensureInitialized() {
        if (this.initPromise) {
            await this.initPromise;
        }
        return this.supabase !== null;
    }

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + 'salt_app_2024');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async cadastrarUsuario(usuario, senha, nomeCompleto) {
        await this.ensureInitialized();
        try {
            const { data: existing } = await this.supabase.from('usuarios').select('id').eq('usuario', usuario).single();
            if (existing) return { success: false, error: 'Usuário já existe' };

            const senhaHash = await this.hashPassword(senha);
            const { data: newUser, error } = await this.supabase.from('usuarios').insert({ usuario, senha_hash: senhaHash, nome_completo: nomeCompleto }).select().single();
            
            if (error) return { success: false, error: 'Erro ao criar usuário' };
            
            this.currentUser = newUser;
            localStorage.setItem('supabase_user', JSON.stringify({ id: newUser.id, usuario: newUser.usuario, nome: newUser.nome_completo }));
            return { success: true, userData: newUser };
        } catch (error) {
            return { success: false, error: 'Erro interno no cadastro' };
        }
    }

    async logarUsuario(usuario, senha) {
        await this.ensureInitialized();
        try {
            const senhaHash = await this.hashPassword(senha);
            const { data: userData, error } = await this.supabase.from('usuarios').select('*').eq('usuario', usuario).eq('senha_hash', senhaHash).single();

            if (error || !userData) return { success: false, error: 'Usuário ou senha incorretos' };

            this.currentUser = userData;
            localStorage.setItem('supabase_user', JSON.stringify({ id: userData.id, usuario: userData.usuario, nome: userData.nome_completo }));
            return { success: true, userData: userData };
        } catch (error) {
            return { success: false, error: 'Erro interno no login' };
        }
    }
    
    logout() {
        this.currentUser = null;
        localStorage.removeItem('supabase_user');
        window.dispatchEvent(new Event('supabaseLogout'));
    }
    
    isLoggedIn() {
        this.checkExistingSession();
        return this.currentUser !== null;
    }
    
    getCurrentUser() {
        this.checkExistingSession();
        return this.currentUser;
    }

    async carregarRichtextAnotacoes(semana) {
        await this.ensureInitialized();
        this.checkExistingSession();
        if (!this.currentUser || !this.isOnline) return null;

        try {
            const { data, error } = await this.supabase.from('richtext_anotacoes').select('conteudo_html').eq('usuario_id', this.currentUser.id).eq('semana', semana).eq('tipo', 'richtext').maybeSingle();
            if (error && error.code !== 'PGRST116') throw error;
            return data?.conteudo_html || null;
        } catch (error) {
            return null;
        }
    }
    
    async salvarRichtextAnotacoes(semana, conteudo) {
        await this.ensureInitialized();
        this.checkExistingSession();
        if (!this.currentUser || !this.isOnline) return { success: false, error: 'Não conectado' };

        try {
            const { data: existing } = await this.supabase.from('richtext_anotacoes').select('id').eq('usuario_id', this.currentUser.id).eq('semana', semana).eq('tipo', 'richtext').maybeSingle();
            
            const { data, error } = existing
                ? await this.supabase.from('richtext_anotacoes').update({ conteudo_html: conteudo }).eq('id', existing.id).select().single()
                : await this.supabase.from('richtext_anotacoes').insert({ usuario_id: this.currentUser.id, semana, tipo: 'richtext', conteudo_html: conteudo }).select().single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async carregarSentinelaAnotacoes(semana, estudoId) {
        await this.ensureInitialized();
        this.checkExistingSession();
        if (!this.currentUser || !this.isOnline) return null;

        try {
            const { data, error } = await this.supabase.from('richtext_anotacoes').select('conteudo_html').eq('usuario_id', this.currentUser.id).eq('semana', semana).eq('tipo', 'sentinela_anotacoes').maybeSingle();
            if (error && error.code !== 'PGRST116') throw error;

            if (data?.conteudo_html) {
                const wrapper = JSON.parse(data.conteudo_html);
                if (wrapper.estudo !== estudoId) {}
                return wrapper.anotacoes || null;
            }
            return null;
        } catch (error) {
            return null;
        }
    }
    
    async salvarSentinelaAnotacoes(semana, estudoId, anotacoes) {
        await this.ensureInitialized();
        this.checkExistingSession();
        if (!this.currentUser || !this.isOnline) return { success: false, error: 'Não conectado' };

        try {
            const conteudoJSON = JSON.stringify({ estudo: estudoId, anotacoes, timestamp: new Date().toISOString() });
            const { data: existing } = await this.supabase.from('richtext_anotacoes').select('id').eq('usuario_id', this.currentUser.id).eq('semana', semana).eq('tipo', 'sentinela_anotacoes').maybeSingle();

            const { data, error } = existing
                ? await this.supabase.from('richtext_anotacoes').update({ conteudo_html: conteudoJSON }).eq('id', existing.id).select().single()
                : await this.supabase.from('richtext_anotacoes').insert({ usuario_id: this.currentUser.id, semana, tipo: 'sentinela_anotacoes', conteudo_html: conteudoJSON }).select().single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

try {
    window.SupabaseSync = new SupabaseSync();
} catch(e) {}
