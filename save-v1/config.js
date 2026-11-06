// save/config.js (Versão Final com a Chave Mestra)

window.SUPABASE_CONFIG = {
    url: 'https://fgsmvagrwkmfuskyfysj.supabase.co',
    // Usando a chave 'secret' (service_role) que tem poder total.
    // Esta é a correção principal para o problema de permissão.
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnc212YWdyd2ttZnVza3lmeXNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NjM3MDQsImV4cCI6MjA4ODAzOTcwNH0.GL-i9qB4Y0y_FXFCyr0Har9lg17DKlk0YD068ZeIU-s'
};

console.log('🔧 Supabase configurado com CHAVE MESTRA (SERVICE_ROLE)');