/* Admin backup controls — loaded after app.js */
(() => {
  const originalRender = window.renderAdminPanel;
  if (typeof originalRender !== "function") return;
  window.renderAdminPanel = function(...args) {
    const result = originalRender.apply(this, args);
    setTimeout(() => {
      const root = document.getElementById("admin-content");
      if (!root || document.getElementById("backup-admin-section")) return;
      const section = document.createElement("section");
      section.id = "backup-admin-section";
      section.className = "admin-section";
      section.innerHTML = `
        <div class="admin-section-header">🛡️ Backups automáticos</div>
        <div class="admin-row">
          <div class="admin-row-info"><div class="admin-row-name">Intervalo</div><div class="admin-row-sub">O GitHub verifica de hora em hora e executa quando chegar o intervalo.</div></div>
          <select class="input" id="backup-interval" style="width:110px">
            <option value="1">1 hora</option><option value="6">6 horas</option><option value="12">12 horas</option><option value="24">24 horas</option>
          </select>
        </div>
        <div class="admin-row"><span>Ativar backups</span><input type="checkbox" id="backup-enabled" checked></div>
        <div class="admin-row-sub" id="backup-status">Consultando status...</div>
        <button class="btn btn-primary btn-sm" id="backup-save">Salvar configuração</button>
      `;
      root.appendChild(section);
      section.querySelector("#backup-save").addEventListener("click", async () => {
        try {
          await window.emmaApi("admin_save_backup_settings", {
            intervalHours: Number(section.querySelector("#backup-interval").value),
            enabled: section.querySelector("#backup-enabled").checked
          });
          if (window.toast) window.toast("Configuração de backup salva.", "success");
          await load();
        } catch (e) { if (window.toast) window.toast(e.message || "Falha ao salvar.", "error"); }
      });
      load();
      async function load() {
        try {
          const r = await window.emmaApi("admin_get_backup_settings");
          const v = r.settings || {};
          section.querySelector("#backup-interval").value = String(v.intervalHours || 24);
          section.querySelector("#backup-enabled").checked = v.enabled !== false;
          section.querySelector("#backup-status").textContent = v.lastBackupAt
            ? "Último backup: " + new Date(v.lastBackupAt).toLocaleString("pt-BR") + " · " + (v.lastStatus || "sucesso")
            : "Nenhum backup registrado ainda. O primeiro será executado pelo agendamento.";
        } catch (e) { section.querySelector("#backup-status").textContent = "Erro ao consultar status: " + (e.message || ""); }
      }
    }, 0);
    return result;
  };
})();
