import {
  escapeHtml,
  formatTime,
  metricLabel,
  timePhase,
  workloadLabel,
} from './state.js';

const TAB_LABELS = {
  home: { icon: '⌂', label: 'Inicio' },
  agenda: { icon: '▦', label: 'Agenda' },
  health: { icon: '♥', label: 'Salud' },
  map: { icon: '◎', label: 'GPS' },
  system: { icon: '⚙', label: 'Sistema' },
};

const MODE_LABELS = {
  clock: 'Reloj',
  dose: 'Aviso de dosis',
  appointments: 'Próximas citas',
  empty: 'Reposición',
  announcement: 'Aviso de voz',
  emergency: 'Alerta simulada',
};

const DOSE_LABELS = {
  sin_programar: 'No programada',
  programada: 'Dosis programada',
  aviso_enviado: 'Aviso enviado',
  compartimento_abierto: 'Compartimento abierto',
  interaccion_completada: 'Interacción completada',
  toma_confirmada_persona: 'Toma confirmada por Rosa',
};

export class UI {
  constructor(state, bus, game) {
    this.state = state;
    this.bus = bus;
    this.game = game;
    this.hudTimer = 0;
    this.captionTimer = null;
    this.cache = {
      shell: document.getElementById('game-shell'),
      clockTime: document.getElementById('clock-time'),
      phaseIcon: document.getElementById('phase-icon'),
      phaseLabel: document.getElementById('phase-label'),
      npcActivity: document.getElementById('npc-activity'),
      deviceStatus: document.getElementById('device-status'),
      metrics: document.getElementById('metrics'),
      pauseBtn: document.getElementById('pause-btn'),
      unreadBadge: document.getElementById('unread-badge'),
      guide: document.getElementById('guide'),
      toastStack: document.getElementById('toast-stack'),
      tooltip: document.getElementById('tooltip'),
      caption: document.getElementById('caption'),
      inspector: document.getElementById('inspector'),
      phone: document.getElementById('phone'),
      phoneContent: document.getElementById('phone-content'),
      decisionRoot: document.getElementById('decision-root'),
      modalRoot: document.getElementById('modal-root'),
    };
    this.bindEvents();
    this.applySettings();
    this.renderAll();
  }

  bindEvents() {
    document.addEventListener('click', (event) => {
      const element = event.target.closest('[data-action]');
      if (!element || element.disabled) return;
      const action = element.dataset.action;
      if (action === 'toggle-check') event.preventDefault();
      const toast = element.closest('.toast');
      this.game.handleAction(action, element, event);
      if (toast && action !== 'dismiss-toast') toast.remove();
    });

    document.addEventListener('change', (event) => {
      const element = event.target.closest('[data-draft]');
      if (!element) return;
      const [group, key] = element.dataset.draft.split('.');
      this.state.ui[group] ||= {};
      this.state.ui[group][key] = element.value;
    });
  }

  renderAll() {
    this.renderHUD();
    this.renderGuide();
    this.renderPhone();
    this.renderInspector();
    this.renderDecision();
    this.renderModal();
  }

  applySettings() {
    const settings = this.state.ui.settings;
    document.body.classList.toggle('high-contrast', settings.highContrast);
    document.body.classList.toggle('large-text', settings.largeText);
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  }

  renderHUD() {
    const { state } = this;
    const phase = timePhase(state.time);
    this.cache.clockTime.textContent = formatTime(state.time);
    this.cache.phaseIcon.textContent = phase.icon;
    this.cache.phaseLabel.textContent = `${phase.label} · jornada resumida`;
    this.cache.npcActivity.textContent = state.npcActivity || 'Rosa está en la sala';

    const unread = state.notifications.filter((item) => !item.read).length;
    const wearableText = state.emergency.active
      ? 'Wearable: SOS activo'
      : `Wearable: GPS · ${state.wearable.pulse} lpm`;
    const fixedText = `Fijo: ${MODE_LABELS[state.device.mode] || 'Reloj'}`;
    const appText = state.emergency.active
      ? 'App: emergencia simulada'
      : unread ? `App: ${unread} aviso${unread === 1 ? '' : 's'}` : 'App: al día';
    const stockText = state.medication.stock === 'low' || state.medication.stock === 'pending'
      ? 'Medicamento: por reponer'
      : state.medication.stock === 'restocked'
        ? 'Medicamento: repuesto'
        : 'Medicamento: disponible';
    this.cache.deviceStatus.innerHTML = [
      { text: fixedText, className: state.device.mode === 'dose' || state.device.mode === 'emergency' ? 'alert' : '' },
      { text: wearableText, className: state.emergency.active ? 'alert' : '' },
      { text: appText, className: state.emergency.active ? 'alert' : unread ? 'pending' : '' },
      { text: stockText, className: state.medication.stock === 'low' || state.medication.stock === 'pending' ? 'pending' : '' },
    ].map((item) => `<span class="status-chip ${item.className}">${escapeHtml(item.text)}</span>`).join('');

    this.cache.metrics.innerHTML = [
      { key: 'autonomy', label: 'Autonomía' },
      { key: 'calm', label: 'Tranquilidad' },
      { key: 'routine', label: 'Rutina' },
      { key: 'workload', label: 'Carga' },
    ].map((item) => {
      const value = state.metrics[item.key];
      return `<div class="metric ${item.key === 'workload' ? 'workload' : ''}" title="${item.label}: ${item.key === 'workload' ? workloadLabel(value) : metricLabel(value)}">
        <span class="metric-label">${item.label}</span>
        <div class="metric-track"><div class="metric-fill" style="width:${value * 20}%"></div></div>
      </div>`;
    }).join('');

    this.cache.pauseBtn.textContent = state.paused ? '▶' : 'Ⅱ';
    this.cache.pauseBtn.setAttribute('aria-label', state.paused ? 'Reanudar el tiempo' : 'Pausar el tiempo');
    this.cache.pauseBtn.title = state.paused ? 'Reanudar (Espacio)' : 'Pausar (Espacio)';
    document.querySelectorAll('[data-action="set-speed"]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.speed) === state.timeSpeed);
    });

    if (unread > 0) {
      this.cache.unreadBadge.textContent = String(unread);
      this.cache.unreadBadge.classList.remove('hidden');
    } else {
      this.cache.unreadBadge.classList.add('hidden');
    }
  }

  renderGuide() {
    const items = this.game.getGuideItems();
    const done = items.filter((item) => item.done).length;
    const percent = items.length ? Math.round((done / items.length) * 100) : 100;
    const collapsed = Boolean(this.state.ui.guideCollapsed);
    this.cache.guide.innerHTML = `
      <div class="guide-header">
        <div>
          <h2>${escapeHtml(this.game.getGuideTitle())}</h2>
          <p class="guide-subtitle">${done} de ${items.length} pasos · el tiempo puede pausarse</p>
        </div>
        <button class="guide-toggle" data-action="toggle-guide">${collapsed ? 'Mostrar' : 'Ocultar'}</button>
      </div>
      <div class="guide-progress" aria-label="Progreso de la guía"><span style="width:${percent}%"></span></div>
      ${collapsed ? '' : `
        <ul class="guide-list">
          ${items.map((item) => `
            <li class="guide-item ${item.done ? 'done' : ''}">
              <span class="guide-check" aria-hidden="true">${item.done ? '✓' : ''}</span>
              <span class="guide-text"><strong>${escapeHtml(item.title)}</strong>${item.hint ? `<small>${escapeHtml(item.hint)}</small>` : ''}</span>
            </li>
          `).join('')}
        </ul>
        <p class="guide-note">${escapeHtml(this.game.getGuideNote())}</p>
      `}
    `;
  }

  renderPhone() {
    const { state } = this;
    const open = state.ui.phoneOpen;
    this.cache.phone.classList.toggle('hidden', !open);
    this.cache.shell.classList.toggle('phone-open', open);
    if (!open) return;

    const tab = state.ui.activeTab;
    const content = {
      home: () => this.renderHome(),
      agenda: () => this.renderAgenda(),
      health: () => this.renderHealth(),
      map: () => this.renderMap(),
      system: () => this.renderSystem(),
    }[tab] || (() => this.renderHome());

    this.cache.phoneContent.innerHTML = `
      <button class="phone-close" data-action="close-phone" aria-label="Cerrar aplicación">×</button>
      ${content()}
      <nav class="tabs" aria-label="Secciones de la aplicación">
        ${Object.entries(TAB_LABELS).map(([id, item]) => `
          <button class="tab ${tab === id ? 'active' : ''}" data-action="phone-tab" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">
            <span class="tab-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>
          </button>
        `).join('')}
      </nav>
    `;
    if (tab === 'map') this.updateMapMarker();
  }

  renderHome() {
    const { state } = this;
    let banner = {
      className: '',
      icon: '✓',
      title: 'Sistema en funcionamiento',
      text: 'Los tres dispositivos están sincronizados en esta simulación.',
    };
    if (state.emergency.active) {
      banner = {
        className: 'alert',
        icon: '!',
        title: 'Alerta SOS simulada',
        text: 'Consulta la ubicación GPS y los signos vitales antes de responder.',
      };
    } else if (state.medication.stock === 'low' || state.medication.stock === 'pending') {
      banner = {
        className: '',
        icon: '↻',
        title: 'Reposición pendiente',
        text: 'Rosa indicó que un medicamento se ha agotado.',
      };
    } else if (state.doseStatus === 'interaccion_completada') {
      banner = {
        className: '',
        icon: '◐',
        title: 'Interacción registrada',
        text: 'La retirada de la pastilla no confirma por sí sola la ingesta.',
      };
    }

    const highlights = this.game.getPhoneHighlights();
    return `
      <header class="phone-header">
        <div>
          <h2>Hola, Álex</h2>
          <p>${formatTime(state.time)} · aplicación del cuidador</p>
        </div>
        <span class="avatar" aria-hidden="true">A</span>
      </header>
      <div class="status-banner ${banner.className}">
        <span class="big-icon" aria-hidden="true">${banner.icon}</span>
        <div><strong>${escapeHtml(banner.title)}</strong><small>${escapeHtml(banner.text)}</small></div>
      </div>
      <div class="quick-grid">
        <button class="quick-button" data-action="phone-tab" data-tab="agenda"><span class="icon">▦</span><span><strong>Agenda</strong><small>Dosis y citas</small></span></button>
        <button class="quick-button" data-action="phone-tab" data-tab="health"><span class="icon">♥</span><span><strong>Signos vitales</strong><small>Pulso y O₂</small></span></button>
        <button class="quick-button" data-action="phone-tab" data-tab="map"><span class="icon">◎</span><span><strong>Ubicación</strong><small>GPS simulado</small></span></button>
        <button class="quick-button" data-action="phone-tab" data-tab="system"><span class="icon">⚙</span><span><strong>Estado</strong><small>Sincronización</small></span></button>
      </div>
      <h3 class="section-title">Próximos hitos</h3>
      <div class="feed">
        ${highlights.length ? highlights.map((item) => `
          <div class="scheduled-card">
            <span class="scheduled-time">${escapeHtml(item.time)}</span>
            <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>
          </div>
        `).join('') : '<div class="empty-state">La agenda está al día. Puedes seguir explorando la vivienda.</div>'}
      </div>
      <h3 class="section-title">Notificaciones <button class="app-button ghost" data-action="mark-notifications-read">Marcar leídas</button></h3>
      <div class="feed">
        ${state.notifications.length ? state.notifications.slice(0, 5).map((item) => this.renderNotification(item)).join('') : '<div class="empty-state">Todavía no hay avisos. Aparecerán aquí cuando ocurran eventos.</div>'}
      </div>
    `;
  }

  renderNotification(item) {
    const actions = (item.actions || []).map((action) => `
      <button
        data-action="${escapeHtml(action.action)}"
        ${Object.entries(action.data || {}).map(([key, value]) => `data-${escapeHtml(key)}="${escapeHtml(value)}"`).join(' ')}
      >${escapeHtml(action.label)}</button>
    `).join('');
    return `
      <article class="notification ${item.read ? '' : 'unread'} ${item.urgent ? 'urgent' : ''}">
        <div class="notification-head">
          <span aria-hidden="true">${escapeHtml(item.icon)}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <time>${escapeHtml(item.time)}</time>
        </div>
        <p>${escapeHtml(item.body)}</p>
        ${actions ? `<div class="notification-actions">${actions}</div>` : ''}
      </article>
    `;
  }

  renderAgenda() {
    const { state } = this;
    const dose = state.doses[0];
    const appointment = state.appointments[0];
    const draftDose = state.ui.draftDose || { med: 'Losartán 50 mg', time: '540' };
    const draftAppointment = state.ui.draftAppointment || { title: 'Control con la doctora Ruiz', time: '690' };
    const prep = state.appointmentPrep;
    const checklistDone = Object.values(prep.checklist).every(Boolean);
    return `
      <header class="phone-header">
        <div><h2>Agenda</h2><p>Programa recordatorios y citas</p></div>
      </header>
      <div class="state-line ${dose ? 'ok' : ''}">
        <span class="state-dot"></span><span>Dosis: ${escapeHtml(DOSE_LABELS[state.doseStatus] || state.doseStatus)}</span>
      </div>
      ${dose ? `
        <div class="scheduled-card" style="margin-top:9px">
          <span class="scheduled-time">${formatTime(dose.time)}</span>
          <div>
            <strong>${escapeHtml(dose.name)}</strong>
            <small>Programada desde la app y enviada al dispositivo fijo.</small>
          </div>
        </div>
      ` : `
        <form class="form-card" style="margin-top:9px" onsubmit="return false">
          <h3>Programar una dosis</h3>
          <div class="form-row">
            <label>Medicamento
              <select data-draft="draftDose.med">
                ${['Losartán 50 mg', 'Vitamina D'].map((name) => `<option value="${escapeHtml(name)}" ${draftDose.med === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
              </select>
            </label>
            <label>Hora
              <select data-draft="draftDose.time">
                ${[[540, '09:00'], [570, '09:30'], [600, '10:00']].map(([value, label]) => `<option value="${value}" ${String(draftDose.time) === String(value) ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
          </div>
          <button class="app-button primary" data-action="schedule-dose">Guardar dosis en el reloj</button>
        </form>
      `}

      <div class="state-line ${appointment ? 'ok' : ''}" style="margin-top:12px">
        <span class="state-dot"></span><span>Cita: ${escapeHtml(appointment ? `${formatTime(appointment.time)} · ${appointment.title}` : 'sin registrar')}</span>
      </div>
      ${appointment ? `
        <div class="scheduled-card" style="margin-top:9px">
          <span class="scheduled-time">${formatTime(appointment.time)}</span>
          <div><strong>${escapeHtml(appointment.title)}</strong><small>El dispositivo fijo avisará con antelación.</small></div>
        </div>
        <button class="app-button" style="width:100%;margin-top:8px" data-action="fixed-appointments">Escuchar citas en el dispositivo fijo</button>
      ` : `
        <form class="form-card" style="margin-top:9px" onsubmit="return false">
          <h3>Registrar una cita</h3>
          <label>Motivo
            <select data-draft="draftAppointment.title">
              ${['Control con la doctora Ruiz', 'Revisión de audición', 'Consulta de seguimiento'].map((title) => `<option value="${escapeHtml(title)}" ${draftAppointment.title === title ? 'selected' : ''}>${escapeHtml(title)}</option>`).join('')}
            </select>
          </label>
          <label>Hora
            <select data-draft="draftAppointment.time">
              ${[[690, '11:30'], [720, '12:00'], [750, '12:30']].map(([value, label]) => `<option value="${value}" ${String(draftAppointment.time) === String(value) ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <button class="app-button primary" data-action="schedule-appointment">Guardar cita y sincronizar</button>
        </form>
      `}

      ${prep.mode === 'juntos' ? `
        <h3 class="section-title">Lista para la cita ${checklistDone ? '<span class="pill">Completa</span>' : ''}</h3>
        <div class="checklist">
          ${[
            ['document', 'Documento de identidad'],
            ['jacket', 'Chaqueta azul elegida por Rosa'],
            ['keys', 'Llaves de casa'],
          ].map(([key, label]) => `
            <label class="${prep.checklist[key] ? 'done' : ''}">
              <input type="checkbox" data-action="toggle-check" data-item="${key}" ${prep.checklist[key] ? 'checked' : ''} />
              <span>${label}</span>
            </label>
          `).join('')}
        </div>
        <p class="device-note">Repasa la lista con Rosa. Cada casilla es una acción real dentro de la simulación.</p>
      ` : ''}
    `;
  }

  renderHealth() {
    const { state } = this;
    const history = state.wearable.history.slice(-14);
    const pulsePoints = history.map((entry, index) => {
      const x = 4 + (index / Math.max(1, history.length - 1)) * 92;
      const y = 52 - Math.max(0, Math.min(1, (entry.pulse - 60) / 60)) * 46;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const oxygenPoints = history.map((entry, index) => {
      const x = 4 + (index / Math.max(1, history.length - 1)) * 92;
      const y = 52 - Math.max(0, Math.min(1, (entry.spo2 - 92) / 8)) * 46;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `
      <header class="phone-header">
        <div><h2>Signos vitales</h2><p>Lecturas simuladas del wearable</p></div>
      </header>
      <div class="vitals-grid">
        <div class="vital-card">
          <span class="eyebrow">Pulso</span>
          <span class="value">${state.wearable.pulse} <span class="unit">lpm</span></span>
          <small>Última lectura · ${formatTime(state.wearable.lastUpdate)}</small>
        </div>
        <div class="vital-card">
          <span class="eyebrow">Concentración de O₂</span>
          <span class="value">${state.wearable.spo2}<span class="unit">%</span></span>
          <small>Dato simulado, no diagnóstico</small>
        </div>
      </div>
      <h3 class="section-title">Tendencia de la jornada</h3>
      <svg class="sparkline" viewBox="0 0 100 58" preserveAspectRatio="none" role="img" aria-label="Gráfico de pulso y concentración de oxígeno durante la jornada">
        <polyline points="${pulsePoints}" stroke="#b6493b"></polyline>
        <polyline points="${oxygenPoints}" stroke="#347a74"></polyline>
      </svg>
      <p class="device-note"><span class="pill">♥ Pulso</span> <span class="pill">O₂ Oxígeno</span> · ${history.length} lectura${history.length === 1 ? '' : 's'} registrada${history.length === 1 ? '' : 's'}.</p>
      <div class="state-line ${state.wearable.possibleFall ? 'alert' : 'ok'}" style="margin-top:10px">
        <span class="state-dot"></span><span>Posible caída: ${state.wearable.possibleFall ? 'señal simulada' : 'sin eventos'}</span>
      </div>
      <div class="device-buttons" style="margin-top:12px">
        <button class="primary" data-action="update-vitals">Actualizar lectura</button>
        <button data-action="inspect-wearable">Ver wearable en 3D</button>
      </div>
      <div class="tip-card">
        <strong>Consejo de cuidado</strong><br />
        Los signos vitales ayudan a contextualizar una alerta. Habla con Rosa y respeta su versión antes de decidir por ella.
      </div>
    `;
  }

  renderMap() {
    const gps = this.game.getGPS();
    return `
      <header class="phone-header">
        <div><h2>Ubicación GPS</h2><p>Posición simulada del wearable</p></div>
      </header>
      <div class="status-banner">
        <span class="big-icon" aria-hidden="true">◎</span>
        <div><strong>GPS disponible</strong><small>Actualizado a las ${formatTime(this.state.time)} · sin servicios de ubicación reales.</small></div>
      </div>
      <div class="map-card" aria-label="Plano de la vivienda">
        <span class="map-room dormitorio">DORMITORIO</span>
        <span class="map-room bano">BAÑO</span>
        <span class="map-room cocina">COCINA</span>
        <span class="map-room sala">SALA</span>
        <span class="map-room entrada">ENTRADA</span>
        <span class="map-room jardin">JARDÍN</span>
        <span id="map-marker" class="map-marker" aria-label="Posición de Rosa"></span>
      </div>
      <div class="map-caption">
        <span class="pill" id="map-room-label">${escapeHtml(gps.room)}</span>
        <span id="map-room-detail">Rosa está ${escapeHtml(gps.phrase || gps.room.toLowerCase())}.</span>
      </div>
      <div class="device-buttons" style="margin-top:12px">
        <button class="primary" data-action="consult-gps">Consultar ubicación</button>
        <button data-action="phone-tab" data-tab="health">Ver signos vitales</button>
      </div>
      <p class="device-note">El marcador sigue al wearable de Rosa dentro del entorno 3D. Es una representación interna para la simulación.</p>
    `;
  }

  renderSystem() {
    const { state } = this;
    const fixedStatus = state.device.compartmentOpen ? 'Compartimento abierto' : 'Compartimento cerrado';
    const voice = state.ui.settings.voice;
    return `
      <header class="phone-header">
        <div><h2>Estado del sistema</h2><p>Conexión simulada entre dispositivos</p></div>
      </header>
      <div class="feed">
        <article class="notification">
          <div class="notification-head"><span>⌚</span><strong>Dispositivo fijo</strong><time>${formatTime(state.time)}</time></div>
          <p>${escapeHtml(MODE_LABELS[state.device.mode] || 'Reloj')} · ${escapeHtml(fixedStatus)} · ${escapeHtml(DOSE_LABELS[state.doseStatus])}.</p>
        </article>
        <article class="notification">
          <div class="notification-head"><span>◎</span><strong>Wearable</strong><time>${formatTime(state.wearable.lastUpdate)}</time></div>
          <p>GPS disponible · pulso ${state.wearable.pulse} lpm · O₂ ${state.wearable.spo2}% · ${state.emergency.active ? 'SOS activo' : 'sin alerta'}.</p>
        </article>
        <article class="notification">
          <div class="notification-head"><span>▣</span><strong>Aplicación</strong><time>${formatTime(state.time)}</time></div>
          <p>${state.doses.length} dosis y ${state.appointments.length} cita${state.appointments.length === 1 ? '' : 's'} sincronizada${state.appointments.length === 1 ? '' : 's'} · ${state.notifications.length} avisos.</p>
        </article>
      </div>
      <h3 class="section-title">Herramientas</h3>
      <div class="toggle-row">
        <span>Voz del dispositivo fijo</span>
        <button class="${voice ? 'on' : ''}" data-action="toggle-setting" data-setting="voice">${voice ? 'Activada' : 'Silenciada'}</button>
      </div>
      <div class="device-buttons" style="margin-top:10px">
        <button data-action="repeat-announcement">Repetir último aviso de voz</button>
        <button data-action="test-sound">Probar aviso sonoro</button>
      </div>
      <h3 class="section-title">Registro de sincronización</h3>
      <div class="sync-list">
        ${state.syncLog.length ? state.syncLog.slice(0, 12).map((item) => `
          <div class="sync-item"><time>${escapeHtml(item.time)}</time><span>${escapeHtml(item.message)}</span></div>
        `).join('') : '<div class="empty-state">Todavía no hay eventos de sincronización.</div>'}
      </div>
    `;
  }

  updateMapMarker() {
    const marker = document.getElementById('map-marker');
    const label = document.getElementById('map-room-label');
    const detail = document.getElementById('map-room-detail');
    if (!marker) return;
    const gps = this.game.getGPS();
    const left = Math.max(4, Math.min(96, ((gps.x + 10) / 20) * 90 + 5));
    const top = Math.max(6, Math.min(94, ((gps.z + 7) / 17) * 88 + 6));
    marker.style.left = `${left}%`;
    marker.style.top = `${top}%`;
    if (label) label.textContent = gps.room;
    if (detail) detail.textContent = `Rosa está ${gps.phrase || gps.room.toLowerCase()}.`;
  }

  renderInspector() {
    const type = this.state.ui.inspector;
    this.cache.inspector.classList.toggle('hidden', !type);
    if (!type) return;
    const renderers = {
      fixed: () => this.renderFixedInspector(),
      wearable: () => this.renderWearableInspector(),
      calendar: () => this.renderCalendarInspector(),
    };
    this.cache.inspector.innerHTML = renderers[type]?.() || '';
  }

  renderFixedInspector() {
    const { state } = this;
    const appointment = state.appointments[0];
    return `
      <div class="inspector-head">
        <div><span class="eyebrow">Dispositivo 1</span><h2>Reloj asistente y pastillero</h2></div>
        <button class="inspector-close" data-action="close-inspector" aria-label="Cerrar detalle">×</button>
      </div>
      <div class="device-render fixed" aria-hidden="true"></div>
      <div class="info-row"><span>Hora visible</span><strong>${formatTime(state.time)}</strong></div>
      <div class="info-row"><span>Modo</span><strong>${escapeHtml(MODE_LABELS[state.device.mode] || 'Reloj')}</strong></div>
      <div class="info-row"><span>Compartimento</span><strong>${state.device.compartmentOpen ? 'Abierto' : 'Cerrado'}</strong></div>
      <div class="info-row"><span>Dosis</span><strong>${escapeHtml(DOSE_LABELS[state.doseStatus])}</strong></div>
      <div class="info-row"><span>Próxima cita</span><strong>${appointment ? `${formatTime(appointment.time)}` : 'Sin registrar'}</strong></div>
      <p class="device-note">${escapeHtml(state.device.caption)}</p>
      <div class="device-buttons three">
        <button data-action="fixed-back" title="Volver al modo reloj" style="border-color:#5d9a72">Reloj</button>
        <button data-action="fixed-appointments" title="Consultar próximas citas" style="border-color:#5b83a8">Citas</button>
        <button data-action="fixed-empty" title="Indicar medicamento agotado" style="border-color:#d8a84b">Agotado</button>
      </div>
      <p class="device-note">El pastillero registra una interacción con el compartimento; no detecta por sí solo que la pastilla haya sido ingerida.</p>
    `;
  }

  renderWearableInspector() {
    const { state } = this;
    const gps = this.game.getGPS();
    return `
      <div class="inspector-head">
        <div><span class="eyebrow">Dispositivo 2</span><h2>Wearable de Rosa</h2></div>
        <button class="inspector-close" data-action="close-inspector" aria-label="Cerrar detalle">×</button>
      </div>
      <div class="device-render wearable" aria-hidden="true"></div>
      <div class="info-row"><span>Hora</span><strong>${formatTime(state.time)}</strong></div>
      <div class="info-row"><span>Pulso</span><strong>${state.wearable.pulse} lpm</strong></div>
      <div class="info-row"><span>Concentración de O₂</span><strong>${state.wearable.spo2}%</strong></div>
      <div class="info-row"><span>Ubicación GPS</span><strong>${escapeHtml(gps.room)}</strong></div>
      <div class="info-row"><span>Botón SOS</span><strong>${state.emergency.active ? 'Alerta activa' : 'En espera'}</strong></div>
      <div class="device-buttons">
        <button data-action="phone-tab" data-tab="health">Ver signos vitales en la app</button>
        <button data-action="phone-tab" data-tab="map">Consultar GPS en la app</button>
        <button class="danger" data-action="wearable-sos" ${state.emergency.active ? 'disabled' : ''}>Simular pulsación SOS</button>
      </div>
      <p class="device-note">Alerta simulada: no se envían llamadas, mensajes ni solicitudes reales. Las lecturas son datos de demostración.</p>
    `;
  }

  renderCalendarInspector() {
    const appointment = this.state.appointments[0];
    return `
      <div class="inspector-head">
        <div><span class="eyebrow">Objeto del hogar</span><h2>Calendario de citas</h2></div>
        <button class="inspector-close" data-action="close-inspector" aria-label="Cerrar detalle">×</button>
      </div>
      <div class="device-render calendar" aria-hidden="true"></div>
      <div class="info-row"><span>Próxima cita</span><strong>${appointment ? formatTime(appointment.time) : 'Sin registrar'}</strong></div>
      <div class="info-row"><span>Motivo</span><strong>${appointment ? escapeHtml(appointment.title) : '—'}</strong></div>
      <div class="device-buttons">
        <button class="primary" data-action="fixed-appointments">Escuchar en el dispositivo fijo</button>
        <button data-action="phone-tab" data-tab="agenda">Abrir agenda en la app</button>
      </div>
      <p class="device-note">El calendario se actualiza cuando la cita se registra desde la aplicación del cuidador.</p>
    `;
  }

  showDecision(config) {
    this.state.ui.activeDialogue = null;
    this.state.ui.activeDecision = config;
    this.renderDecision();
    requestAnimationFrame(() => {
      this.cache.decisionRoot.querySelector('[data-action="decision-choice"]')?.focus();
    });
  }

  showDialogue(config) {
    this.state.ui.activeDecision = null;
    this.state.ui.activeDialogue = config;
    this.renderDecision();
    requestAnimationFrame(() => {
      this.cache.decisionRoot.querySelector('.dialogue-options button')?.focus();
    });
  }

  closeDecision() {
    this.state.ui.activeDecision = null;
    this.state.ui.activeDialogue = null;
    this.renderDecision();
  }

  renderDecision() {
    const { state } = this;
    const decision = state.ui.activeDecision;
    const dialogue = state.ui.activeDialogue;
    const visible = Boolean(decision || dialogue);
    this.cache.decisionRoot.classList.toggle('hidden', !visible);
    if (!visible) {
      this.cache.decisionRoot.innerHTML = '';
      return;
    }
    if (dialogue) {
      this.cache.decisionRoot.innerHTML = `
        <div class="dialogue-card" role="dialog" aria-modal="true" aria-label="Conversación con Rosa">
          <div class="decision-kicker"><span class="dialogue-portrait" aria-hidden="true">R</span><span>${escapeHtml(dialogue.kicker || 'Rosa')}</span></div>
          <h2>${escapeHtml(dialogue.title)}</h2>
          <p class="dialogue-line">${escapeHtml(dialogue.text)}</p>
          <div class="dialogue-options">
            ${(dialogue.options || [{ id: 'close', label: 'Continuar', action: 'close-dialogue' }]).map((option) => `
              <button data-action="${escapeHtml(option.action || 'dialogue-option')}" data-topic="${escapeHtml(option.id || 'close')}">${escapeHtml(option.label)}</button>
            `).join('')}
          </div>
        </div>
      `;
      return;
    }
    this.cache.decisionRoot.innerHTML = `
      <div class="decision-card" role="dialog" aria-modal="true" aria-labelledby="decision-title">
        <div class="decision-kicker"><span aria-hidden="true">✦</span><span>${escapeHtml(decision.kicker || 'Decisión de la jornada')}</span><span>· ${formatTime(state.time)}</span></div>
        <h2 id="decision-title">${escapeHtml(decision.title)}</h2>
        <p class="decision-context">${escapeHtml(decision.context)}</p>
        ${decision.quote ? `<p class="decision-quote">“${escapeHtml(decision.quote)}”</p>` : ''}
        ${decision.tools?.length ? `
          <div class="decision-tools">
            ${decision.tools.map((tool) => `<button data-action="decision-tool" data-tool="${escapeHtml(tool.id)}">${escapeHtml(tool.label)}</button>`).join('')}
          </div>
        ` : ''}
        <div class="decision-options">
          ${decision.options.map((option) => `
            <button class="decision-option" data-action="decision-choice" data-choice="${escapeHtml(option.id)}">
              <strong>${escapeHtml(option.label)}</strong>
              <small>${escapeHtml(option.detail)}</small>
              <span class="option-tag">${escapeHtml(option.tag || 'Elegir')}</span>
            </button>
          `).join('')}
        </div>
        <p class="decision-footnote">${escapeHtml(decision.footnote || 'El tiempo se detiene mientras decides. No hay una única respuesta correcta.')}</p>
      </div>
    `;
  }

  openModal(type) {
    this.state.ui.modal = type;
    this.renderModal();
    requestAnimationFrame(() => {
      this.cache.modalRoot.querySelector('.modal-card button')?.focus();
    });
  }

  closeModal() {
    this.state.ui.modal = null;
    this.renderModal();
  }

  renderModal() {
    const type = this.state.ui.modal;
    if (!type) {
      this.cache.modalRoot.innerHTML = '';
      return;
    }
    const content = {
      intro: () => this.renderIntroModal(),
      help: () => this.renderHelpModal(),
      settings: () => this.renderSettingsModal(),
      summary: () => this.renderSummaryModal(),
    }[type] || (() => '');
    this.cache.modalRoot.innerHTML = `<div class="modal-layer" role="presentation">${content()}</div>`;
  }

  renderIntroModal() {
    return `
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div class="intro-hero">
          <span class="eyebrow" style="color:rgba(255,248,233,.8)">Simulador 3D · Cuida·Día</span>
          <h1 id="intro-title">Un día<br />acompañando a Rosa</h1>
          <p>Eres Álex, su cuidador. Explora la vivienda, conoce sus hábitos y descubre cómo colaboran la app, el reloj asistente y el wearable durante una jornada.</p>
        </div>
        <div class="modal-body">
          <div class="story-row">
            <div class="story-card">
              <h3>Rosa, 78 años</h3>
              <p>Maestra jubilada. Le gusta desayunar sin prisa, cuidar sus plantas y elegir su propia ropa. Usa la tecnología, pero decide sobre su rutina.</p>
            </div>
            <div class="story-card">
              <h3>Tres dispositivos conectados</h3>
              <p>Aplicación del cuidador, dispositivo fijo con pastillero y reloj wearable con botón SOS, GPS y lecturas simuladas de pulso y oxígeno.</p>
            </div>
          </div>
          <div class="control-grid">
            <div class="control-item"><kbd>WASD</kbd><span>Mover al cuidador</span></div>
            <div class="control-item"><kbd>Clic</kbd><span>Caminar o interactuar</span></div>
            <div class="control-item"><kbd>Q</kbd><kbd>E</kbd><span>Girar la cámara</span></div>
            <div class="control-item"><kbd>P</kbd><span>Abrir el móvil</span></div>
            <div class="control-item"><kbd>Espacio</kbd><span>Pausar la jornada</span></div>
            <div class="control-item"><kbd>Rueda</kbd><span>Acercar o alejar</span></div>
          </div>
          <p class="notice"><strong>Demostración segura:</strong> todas las alertas, ubicaciones y respuestas de emergencia son simuladas. No se realizan llamadas, mensajes ni solicitudes reales. Los signos vitales son datos de ejemplo, no información médica.</p>
          <div class="modal-actions">
            <button class="app-button primary" data-action="start-game">Comenzar jornada</button>
          </div>
        </div>
      </section>
    `;
  }

  renderHelpModal() {
    return `
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="modal-body">
          <span class="eyebrow">Guía rápida</span>
          <h2 id="help-title" style="margin:5px 0 12px">Controles y flujo de juego</h2>
          <div class="control-grid">
            <div class="control-item"><kbd>WASD</kbd> / <kbd>Flechas</kbd><span>Movimiento</span></div>
            <div class="control-item"><kbd>Clic</kbd> en suelo<span>Caminar hasta el punto</span></div>
            <div class="control-item"><kbd>Clic</kbd> en anillo<span>Inspeccionar objeto</span></div>
            <div class="control-item"><kbd>Q</kbd><kbd>E</kbd><span>Rotar cámara</span></div>
            <div class="control-item"><kbd>Botón derecho</kbd><span>Arrastrar cámara</span></div>
            <div class="control-item"><kbd>Rueda</kbd><span>Zoom</span></div>
            <div class="control-item"><kbd>P</kbd><span>Alternar aplicación</span></div>
            <div class="control-item"><kbd>Espacio</kbd><span>Pausar o reanudar</span></div>
          </div>
          <div class="story-row">
            <div class="story-card"><h3>Sin prisa</h3><p>Las decisiones detienen el tiempo. Puedes usar “Siguiente evento” para pasar a la escena importante siguiente.</p></div>
            <div class="story-card"><h3>Estados reales</h3><p>La app distingue dosis programada, compartimento abierto, interacción completada y toma confirmada por Rosa.</p></div>
          </div>
          <p class="notice">Busca los anillos discretos junto a objetos interactivos. El botón “Móvil” abre la app; el reloj fijo tiene tres botones físicos funcionales.</p>
          <div class="modal-actions"><button class="app-button primary" data-action="close-modal">Volver a la jornada</button></div>
        </div>
      </section>
    `;
  }

  renderSettingsModal() {
    const s = this.state.ui.settings;
    const toggle = (setting, label, enabled) => `
      <div class="toggle-row">
        <span>${label}</span>
        <button class="${enabled ? 'on' : ''}" data-action="toggle-setting" data-setting="${setting}" aria-pressed="${enabled}">${enabled ? 'Activado' : 'Desactivado'}</button>
      </div>
    `;
    return `
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-body">
          <span class="eyebrow">Accesibilidad</span>
          <h2 id="settings-title" style="margin:5px 0 12px">Ajustes de la experiencia</h2>
          ${toggle('voice', 'Voz del dispositivo fijo (síntesis del navegador)', s.voice)}
          ${toggle('largeText', 'Texto ampliado', s.largeText)}
          ${toggle('highContrast', 'Alto contraste', s.highContrast)}
          ${toggle('reducedMotion', 'Reducir animaciones de interfaz', s.reducedMotion)}
          <p class="notice">Todos los avisos de voz incluyen subtítulos en pantalla. Puedes pausar la jornada en cualquier momento; las decisiones no tienen límite de tiempo.</p>
          <div class="modal-actions"><button class="app-button primary" data-action="close-modal">Cerrar ajustes</button></div>
        </div>
      </section>
    `;
  }

  renderSummaryModal() {
    const { state } = this;
    const summary = this.game.getSummaryData();
    const metricRows = [
      { key: 'autonomy', label: 'Autonomía de Rosa', text: metricLabel(state.metrics.autonomy) },
      { key: 'calm', label: 'Tranquilidad', text: metricLabel(state.metrics.calm) },
      { key: 'routine', label: 'Continuidad de la rutina', text: metricLabel(state.metrics.routine) },
      { key: 'workload', label: 'Carga del cuidador', text: workloadLabel(state.metrics.workload) },
    ];
    return `
      <section class="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <div class="modal-body">
          <span class="eyebrow">Resumen de la jornada · 18:00</span>
          <h2 id="summary-title" style="margin:5px 0 6px">${escapeHtml(summary.title)}</h2>
          <p class="decision-context">${escapeHtml(summary.subtitle)}</p>
          <div class="summary-grid">
            <div class="summary-section">
              <h3>Equilibrio al final del día</h3>
              <div class="summary-bars">
                ${metricRows.map((item) => `
                  <div class="summary-bar">
                    <span><span>${item.label}</span><span>${escapeHtml(item.text)}</span></span>
                    <div class="metric-track"><div class="metric-fill" style="width:${state.metrics[item.key] * 20}%"></div></div>
                  </div>
                `).join('')}
              </div>
              <p class="device-note">Estos indicadores son narrativos: muestran tendencias, no una puntuación de éxito o fracaso.</p>
            </div>
            <div class="summary-section">
              <h3>Acontecimientos y respuestas</h3>
              <div class="summary-list">
                ${state.decisions.length ? state.decisions.map((item) => `
                  <div class="summary-item">
                    <strong>${escapeHtml(item.time)} · ${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.choice)}. ${escapeHtml(item.reflection)}</small>
                  </div>
                `).join('') : '<div class="empty-state">No se registraron decisiones narrativas.</div>'}
              </div>
            </div>
            <div class="summary-section">
              <h3>Qué podría mejorar la autonomía</h3>
              <ul class="recommendations">
                ${summary.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
            </div>
            <div class="summary-section">
              <h3>Colaboración de los dispositivos</h3>
              <ul class="recommendations">
                ${summary.technical.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
            </div>
            <div class="tech-note">
              <details>
                <summary>Alcance de esta primera versión funcional</summary>
                <ul>
                  <li><strong>Implementado:</strong> mundo 3D explorable, cámara, personajes animados, estados sincronizados, agenda, pastillero, GPS y signos vitales simulados, decisiones y resumen.</li>
                  <li><strong>Simulado:</strong> comunicación entre dispositivos mediante un bus de eventos interno; voz mediante síntesis del navegador; GPS y lecturas de pulso/O₂ como datos de demostración; respuestas de emergencia sin llamadas reales.</li>
                  <li><strong>Pendiente:</strong> conexión con hardware físico, validación clínica de signos vitales, servicios reales de emergencia y persistencia de partidas.</li>
                </ul>
              </details>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:15px">
            <button class="app-button" data-action="summary-continue">Seguir explorando</button>
            <button class="app-button primary" data-action="restart">Reiniciar jornada</button>
          </div>
        </div>
      </section>
    `;
  }

  showToast(notification) {
    const toast = document.createElement('div');
    toast.className = `toast ${escapeHtml(notification.type || 'info')}`;
    toast.dataset.toastId = notification.id;
    const actions = (notification.actions || []).map((action) => `
      <button
        data-action="${escapeHtml(action.action)}"
        ${Object.entries(action.data || {}).map(([key, value]) => `data-${escapeHtml(key)}="${escapeHtml(value)}"`).join(' ')}
      >${escapeHtml(action.label)}</button>
    `).join('');
    toast.innerHTML = `
      <div class="toast-icon" aria-hidden="true">${escapeHtml(notification.icon || '•')}</div>
      <div>
        <div class="toast-title">${escapeHtml(notification.title)}</div>
        <div class="toast-body">${escapeHtml(notification.body)}</div>
        ${actions ? `<div class="toast-actions">${actions}</div>` : ''}
      </div>
    `;
    this.cache.toastStack.prepend(toast);
    const lifetime = notification.urgent ? 9000 : 6500;
    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(12px)';
      window.setTimeout(() => toast.remove(), 300);
    }, lifetime);
    while (this.cache.toastStack.children.length > 4) {
      this.cache.toastStack.lastElementChild.remove();
    }
  }

  showCaption(text, duration = 6500) {
    this.cache.caption.textContent = text;
    this.cache.caption.classList.remove('hidden');
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => {
      this.cache.caption.classList.add('hidden');
    }, duration);
  }

  showTooltip(text, x, y) {
    const tooltip = this.cache.tooltip;
    tooltip.textContent = text;
    tooltip.classList.remove('hidden');
    const left = Math.min(window.innerWidth - 260, Math.max(8, x + 14));
    const top = Math.min(window.innerHeight - 60, Math.max(8, y + 16));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    this.cache.tooltip.classList.add('hidden');
  }

  update(dt) {
    this.hudTimer += dt;
    if (this.hudTimer > 0.25) {
      this.hudTimer = 0;
      this.renderHUD();
    }
    if (this.state.ui.phoneOpen && this.state.ui.activeTab === 'map') {
      this.updateMapMarker();
    }
  }
}
