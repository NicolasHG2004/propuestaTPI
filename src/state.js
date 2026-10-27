export const START_MINUTES = 8 * 60 + 10;
export const END_MINUTES = 18 * 60;

export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.history = [];
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.listeners.get(type)?.delete(handler);
  }

  emit(type, payload = {}) {
    const envelope = { type, payload, at: performance.now() };
    this.history.push(envelope);
    if (this.history.length > 120) this.history.shift();
    this.listeners.get(type)?.forEach((handler) => {
      try {
        handler(payload, envelope);
      } catch (error) {
        console.error(`[EventBus] Error en ${type}`, error);
      }
    });
    this.listeners.get('*')?.forEach((handler) => {
      try {
        handler(payload, envelope);
      } catch (error) {
        console.error('[EventBus] Error en listener global', error);
      }
    });
  }
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function createState() {
  return {
    time: START_MINUTES,
    timeSpeed: 1,
    paused: false,
    blocked: true,
    finished: false,
    dayLabel: 'Jornada resumida · 08:10–18:00',
    metrics: {
      autonomy: 3,
      calm: 3,
      routine: 3,
      workload: 2,
    },
    flags: {
      introSeen: false,
      inspectedFixed: false,
      inspectedWearable: false,
      openedApp: false,
      conversed: false,
      scheduledDose: false,
      scheduledAppointment: false,
      doseAnnounced: false,
      doseInteraction: false,
      doseConfirmationIntent: false,
      doseConfirmed: false,
      appointmentAnnounced: false,
      preparationDecision: false,
      accompanied: false,
      accompanyPending: false,
      lowStockReported: false,
      restockDecision: false,
      restockDone: false,
      emergencyTriggered: false,
      gpsConsulted: false,
      vitalsConsulted: false,
      emergencyDecision: false,
      emergencyResolved: false,
      visitedRooms: new Set(),
    },
    ui: {
      phoneOpen: false,
      activeTab: 'home',
      inspector: null,
      activeDecision: null,
      modal: null,
      settings: {
        voice: true,
        highContrast: false,
        largeText: false,
        reducedMotion: false,
      },
    },
    doses: [],
    appointments: [],
    notifications: [],
    syncLog: [],
    decisions: [],
    firedEvents: new Set(),
    doseStatus: 'sin_programar',
    appointmentStatus: 'sin_programar',
    medication: {
      name: 'Losartán 50 mg',
      stock: 'ok',
      note: '',
    },
    appointmentPrep: {
      mode: null,
      checklist: { document: false, jacket: false, keys: false },
      completed: false,
    },
    device: {
      mode: 'clock',
      caption: 'Buenos días, Rosa',
      lastAnnouncement: 'Buenos días, Rosa',
      compartmentIndex: 0,
      compartmentOpen: false,
      pillInCompartment: true,
      lastMinute: -1,
      statusText: 'Reloj · en espera',
    },
    wearable: {
      pulse: 74,
      spo2: 98,
      lastUpdate: START_MINUTES,
      history: [
        { time: START_MINUTES, pulse: 74, spo2: 98, note: 'Inicio de jornada' },
      ],
      sos: false,
      possibleFall: false,
    },
    emergency: {
      active: false,
      triggered: false,
      at: null,
      location: null,
      choice: null,
      resolved: false,
      pendingVisit: false,
      outcome: '',
    },
    npcActivity: 'Descansando en la sala',
    lastRoom: 'Sala',
  };
}

export function formatTime(value = START_MINUTES) {
  const total = ((Math.floor(value) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timePhase(minutes) {
  const h = Math.floor(minutes / 60);
  if (h < 12) return { icon: '☀️', label: 'Mañana' };
  if (h < 16) return { icon: '🌤️', label: 'Mediodía' };
  return { icon: '🌇', label: 'Tarde' };
}

export function notify(state, bus, options) {
  const item = {
    id: uid('notification'),
    time: formatTime(state.time),
    type: options.type || 'info',
    title: options.title || 'Aviso',
    body: options.body || '',
    icon: options.icon || '•',
    actions: options.actions || [],
    read: false,
    urgent: Boolean(options.urgent),
  };
  state.notifications.unshift(item);
  if (state.notifications.length > 30) state.notifications.pop();
  bus.emit('notification:new', item);
  return item;
}

export function addSync(state, message, kind = 'sync') {
  const item = {
    id: uid('sync'),
    time: formatTime(state.time),
    message,
    kind,
  };
  state.syncLog.unshift(item);
  if (state.syncLog.length > 40) state.syncLog.pop();
  return item;
}

export function applyEffects(state, effects = {}, bus = null) {
  Object.entries(effects).forEach(([key, amount]) => {
    if (!(key in state.metrics)) return;
    state.metrics[key] = Math.max(0, Math.min(5, state.metrics[key] + amount));
  });
  bus?.emit('metrics:changed', { effects, metrics: { ...state.metrics } });
}

export function recordDecision(state, { id, title, choice, reflection, effects = {} }) {
  state.decisions.push({
    id: uid('decision'),
    eventId: id,
    title,
    choice,
    reflection,
    effects: { ...effects },
    time: formatTime(state.time),
  });
}

export function metricLabel(value) {
  if (value <= 1) return 'baja';
  if (value === 2) return 'moderada';
  if (value === 3) return 'equilibrada';
  if (value === 4) return 'alta';
  return 'muy alta';
}

export function workloadLabel(value) {
  if (value <= 1) return 'muy ligera';
  if (value === 2) return 'ligera';
  if (value === 3) return 'equilibrada';
  if (value === 4) return 'elevada';
  return 'muy elevada';
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
