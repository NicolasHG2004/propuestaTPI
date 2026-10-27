import { createWorld } from './world.js';
import { UI } from './ui.js';
import { Controls } from './controls.js';
import {
  END_MINUTES,
  addSync,
  applyEffects,
  formatTime,
  notify,
  recordDecision,
} from './state.js';

const DOSE_STATUS_TEXT = {
  sin_programar: 'Sin dosis programada',
  programada: 'Dosis programada',
  aviso_enviado: 'Aviso de dosis enviado',
  compartimento_abierto: 'Compartimento abierto',
  interaccion_completada: 'Interacción completada · ingesta no verificada',
  toma_confirmada_persona: 'Toma confirmada por Rosa (autodeclarada)',
};

export class GameDirector {
  constructor({ scene, camera, renderer, canvas, state, bus, audio }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.canvas = canvas;
    this.state = state;
    this.bus = bus;
    this.audio = audio;
    this.timers = [];
    this.elapsed = 0;
    this.decisionHandlers = new Map();
    this.state.setupBlocked = false;
    this.state.ui.setupGateShown = null;
    this.state.ui.guideCollapsed = typeof window !== 'undefined' && window.innerWidth < 700;

    this.world = createWorld(scene, state);
    this.ui = new UI(state, bus, this);
    this.controls = new Controls({
      canvas,
      camera,
      renderer,
      world: this.world,
      state,
      game: this,
      ui: this.ui,
    });

    this.registerBusListeners();
    addSync(state, 'Sistema interno de eventos iniciado: app, dispositivo fijo y wearable.');
    this.ui.openModal('intro');
    this.ui.renderAll();
  }

  /* ------------------------------------------------------------------ *
   * Event bus: all device communication is simulated here.
   * ------------------------------------------------------------------ */
  registerBusListeners() {
    this.bus.on('notification:new', (item) => {
      this.ui.showToast(item);
      this.ui.renderHUD();
      if (this.state.ui.phoneOpen) this.ui.renderPhone();
    });
    this.bus.on('metrics:changed', () => {
      this.ui.renderHUD();
      this.ui.renderGuide();
    });

    this.bus.on('dose:scheduled', ({ dose }) => {
      this.state.doseStatus = 'programada';
      this.state.device.statusText = DOSE_STATUS_TEXT.programada;
      addSync(this.state, `App → Dispositivo fijo: dosis de ${dose.name} programada a las ${formatTime(dose.time)}.`);
      this.world.setDeviceMode('announcement', `Dosis programada: ${dose.name} · ${formatTime(dose.time)}`, DOSE_STATUS_TEXT.programada);
      this.addTimer(5, () => {
        if (this.state.doseStatus === 'programada') {
          this.world.setDeviceMode('clock', 'Buenos días, Rosa', DOSE_STATUS_TEXT.programada);
        }
      });
      this.refreshUI();
    });

    this.bus.on('dose:status', ({ status, message, statusText }) => {
      this.state.doseStatus = status;
      this.state.device.statusText = statusText || DOSE_STATUS_TEXT[status] || status;
      if (message) addSync(this.state, message);
      this.refreshUI();
    });

    this.bus.on('appointment:scheduled', ({ appointment }) => {
      this.state.appointmentStatus = 'programada';
      addSync(this.state, `App → Dispositivo fijo: cita «${appointment.title}» registrada a las ${formatTime(appointment.time)}.`);
      this.world.setDeviceMode('announcement', `Cita registrada: ${formatTime(appointment.time)} · ${appointment.title}`, 'Agenda sincronizada');
      this.addTimer(5, () => {
        if (this.state.appointmentStatus === 'programada') {
          this.world.setDeviceMode('clock', 'Buenos días, Rosa', 'Cita sincronizada');
        }
      });
      this.refreshUI();
    });

    this.bus.on('appointment:status', ({ status, message }) => {
      this.state.appointmentStatus = status;
      if (message) addSync(this.state, message);
      this.refreshUI();
    });

    this.bus.on('device:announce', ({ text, mode, statusText, sound, log = true, duration = 7000 }) => {
      this.world.setDeviceMode(mode || 'announcement', text, statusText || 'Aviso de voz');
      this.audio.beep(sound || 'info');
      this.audio.speak(text, {
        onCaption: (caption) => this.ui.showCaption(caption, duration),
      });
      if (log) addSync(this.state, `Dispositivo fijo → App: anuncio por voz «${text}»`);
      this.refreshUI();
    });

    this.bus.on('wearable:vitals', ({ pulse, spo2, note, log = false }) => {
      this.state.wearable.pulse = pulse;
      this.state.wearable.spo2 = spo2;
      this.state.wearable.lastUpdate = this.state.time;
      this.state.wearable.history.push({
        time: this.state.time,
        pulse,
        spo2,
        note: note || 'Lectura simulada',
      });
      if (this.state.wearable.history.length > 24) this.state.wearable.history.shift();
      if (log) addSync(this.state, `Wearable → App: pulso ${pulse} lpm y concentración de O₂ ${spo2}% (${note || 'lectura'}).`);
      this.refreshUI();
    });

    this.bus.on('wearable:sos', ({ source }) => {
      this.startEmergency(source);
    });

    this.bus.on('medication:status', ({ status, note, message }) => {
      this.state.medication.stock = status;
      if (note !== undefined) this.state.medication.note = note;
      if (message) addSync(this.state, message);
      this.refreshUI();
    });

    this.bus.on('emergency:resolved', ({ method, outcome, effects = {} }) => {
      const emergency = this.state.emergency;
      emergency.active = false;
      emergency.resolved = true;
      emergency.pendingVisit = false;
      emergency.outcome = outcome;
      this.state.wearable.sos = false;
      this.state.wearable.possibleFall = false;
      this.state.flags.emergencyResolved = true;
      applyEffects(this.state, effects, this.bus);
      addSync(this.state, `App: alerta atendida (${method}). ${outcome}`);
      notify(this.state, this.bus, {
        type: 'success',
        icon: '✓',
        title: 'Alerta SOS atendida',
        body: `${outcome} Ninguna llamada o mensaje real fue enviado.`,
        actions: [
          { label: 'Ver estado', action: 'phone-tab', data: { tab: 'system' } },
        ],
      });
      this.world.elder.setExpression('smile');
      this.world.elder.setPose('talk', 4);
      this.state.npcActivity = 'Rosa está acompañada tras la alerta';
      this.addTimer(3, () => this.updateVitals(84, 98, 'Después de la alerta', false));
      this.addTimer(4, () => {
        if (!this.state.emergency.active) {
          this.world.setDeviceMode('clock', 'Buenos días, Rosa', 'Alerta atendida');
        }
      });
      this.refreshUI();
    });
  }

  refreshUI() {
    this.ui.renderHUD();
    this.ui.renderGuide();
    if (this.state.ui.inspector) this.ui.renderInspector();
    if (this.state.ui.phoneOpen) this.ui.renderPhone();
  }

  /* ------------------------------------------------------------------ *
   * Main loop and time.
   * ------------------------------------------------------------------ */
  update(dt) {
    const delta = Math.min(dt, 0.05);
    this.elapsed += delta;
    this.syncTimeBlocking();
    this.updateTimers(delta);
    this.controls.update(delta);
    this.world.update(delta, this.elapsed, this.world.player.group.position);
    this.ui.update(delta);

    if (!this.state.blocked && !this.state.paused && !this.state.finished && this.state.flags.introSeen) {
      const advance = delta * this.state.timeSpeed;
      const gate = this.getSetupGate();
      if (gate && this.state.time + advance >= gate.time) {
        this.state.time = Math.max(this.state.time, gate.time);
        this.showSetupGate(gate.type);
      } else {
        this.state.time += advance;
      }
      if (this.state.time >= END_MINUTES) {
        this.state.time = END_MINUTES;
        this.finishDay();
      } else {
        this.checkEvents();
      }
    }
  }

  syncTimeBlocking() {
    this.state.blocked = this.isUIBlocking() || Boolean(this.state.setupBlocked);
  }

  isUIBlocking() {
    const ui = this.state.ui;
    return Boolean(ui.phoneOpen || ui.activeDecision || ui.activeDialogue || ui.modal || ui.inspector);
  }

  addTimer(delay, callback, id = null) {
    this.timers.push({ remaining: delay, callback, id });
  }

  updateTimers(dt) {
    if (this.state.blocked || this.state.paused || this.state.finished) return;
    const due = [];
    this.timers.forEach((timer) => {
      timer.remaining -= dt;
      if (timer.remaining <= 0) due.push(timer);
    });
    if (!due.length) return;
    this.timers = this.timers.filter((timer) => !due.includes(timer));
    due.forEach((timer) => timer.callback());
  }

  setSpeed(speed) {
    if (this.state.finished) return;
    this.state.timeSpeed = Math.max(1, Math.min(4, Number(speed) || 1));
    this.state.paused = false;
    this.ui.renderHUD();
  }

  togglePause() {
    if (this.state.finished || this.state.ui.modal === 'intro') return;
    this.state.paused = !this.state.paused;
    this.ui.renderHUD();
    this.ui.showCaption(this.state.paused ? 'Jornada en pausa.' : 'Jornada reanudada.', 2200);
  }

  getSetupGate() {
    if (!this.state.flags.scheduledDose) return { time: 8 * 60 + 50, type: 'dose' };
    if (!this.state.flags.scheduledAppointment) return { time: 10 * 60 + 45, type: 'appointment' };
    return null;
  }

  showSetupGate(type) {
    this.state.setupBlocked = true;
    const alreadyShown = this.state.ui.setupGateShown === type;
    this.state.ui.setupGateShown = type;
    if (alreadyShown) return;
    const message = type === 'dose'
      ? 'Programa la dosis desde la Agenda para que el reloj sepa cuándo avisar.'
      : 'Registra la cita desde la Agenda para que el reloj pueda anunciarla.';
    notify(this.state, this.bus, {
      type: 'reminder',
      icon: '▦',
      title: 'La jornada necesita tu agenda',
      body: message,
      actions: [{ label: 'Abrir Agenda', action: 'phone-tab', data: { tab: 'agenda' } }],
    });
    this.ui.showCaption(message, 6000);
    this.openPhoneTab('agenda');
  }

  releaseSetupGateIfPossible() {
    const gate = this.getSetupGate();
    this.state.setupBlocked = Boolean(gate && this.state.time >= gate.time);
    if (!this.state.setupBlocked) this.state.ui.setupGateShown = null;
    this.syncTimeBlocking();
  }

  getEvents() {
    const state = this.state;
    const events = [
      { id: 'breakfast', time: 8 * 60 + 25, run: () => this.startBreakfast() },
      { id: 'vitalsMorning', time: 10 * 60, run: () => this.periodicVitals(78, 98, 'Rutina de mañana') },
      { id: 'vitalsMidday', time: 12 * 60 + 40, run: () => this.periodicVitals(82, 98, 'Después de la comida') },
      { id: 'autonomy', time: 13 * 60 + 10, run: () => this.startAutonomyMoment() },
      { id: 'vitalsAfternoon', time: 15 * 60, run: () => this.periodicVitals(76, 98, 'Tarde tranquila') },
      {
        id: 'lowStock',
        time: 14 * 60 + 10,
        guard: () => !state.flags.lowStockReported,
        run: () => this.reportLowStock('scheduled'),
      },
      {
        id: 'emergency',
        time: 16 * 60 + 20,
        guard: () => !state.flags.emergencyTriggered,
        run: () => this.triggerSOS('scheduled'),
      },
      {
        id: 'emergencyTimeout',
        time: 17 * 60 + 20,
        guard: () => state.emergency.pendingVisit && !state.emergency.resolved,
        run: () => this.resolveEmergency({
          method: 'timeout',
          outcome: 'La alerta se cerró por tiempo sin acompañamiento presencial.',
          effects: { calm: -1 },
        }),
      },
      { id: 'summary', time: END_MINUTES, run: () => this.finishDay() },
    ];

    const dose = state.doses[0];
    if (dose) {
      events.push({ id: 'doseDue', time: dose.time, run: () => this.startDoseFlow() });
    }
    const appointment = state.appointments[0];
    if (appointment) {
      events.push({ id: 'appointmentAnnounce', time: appointment.announceAt, run: () => this.startAppointmentAnnouncement() });
      events.push({ id: 'preparation', time: appointment.prepareAt, run: () => this.showPreparationDecision() });
      events.push({ id: 'appointmentTime', time: appointment.time, run: () => this.appointmentStart() });
    }
    return events;
  }

  getNextPendingEventTime() {
    const pending = this.getEvents()
      .filter((event) => !this.state.firedEvents.has(event.id))
      .map((event) => event.time)
      .filter((time) => time >= this.state.time - 0.01);
    let next = pending.length ? Math.min(...pending) : END_MINUTES;
    const gate = this.getSetupGate();
    if (gate && gate.time <= next) next = gate.time;
    return Math.max(this.state.time, next);
  }

  checkEvents() {
    if (this.state.blocked || this.state.paused || this.state.finished || !this.state.flags.introSeen) return;
    const events = this.getEvents().sort((a, b) => a.time - b.time);
    for (const event of events) {
      if (this.state.time < event.time) break;
      if (this.state.firedEvents.has(event.id)) continue;
      this.state.firedEvents.add(event.id);
      if (event.guard && !event.guard()) continue;
      event.run();
      break;
    }
  }

  advanceToNextEvent() {
    if (this.state.finished) {
      this.ui.openModal('summary');
      return;
    }
    if (this.state.ui.modal === 'intro' || this.state.ui.activeDecision || this.state.ui.activeDialogue) return;
    this.closePhone(false);
    this.closeInspector(false);
    const gate = this.getSetupGate();
    const next = this.getNextPendingEventTime();
    if (gate && gate.time <= next) {
      this.state.time = Math.max(this.state.time, gate.time);
      this.showSetupGate(gate.type);
      this.ui.renderHUD();
      return;
    }
    this.state.paused = false;
    this.state.time = Math.max(this.state.time, Math.min(next, END_MINUTES));
    this.ui.renderHUD();
    this.checkEvents();
  }

  /* ------------------------------------------------------------------ *
   * Shared story/UI helpers.
   * ------------------------------------------------------------------ */
  hideOverlaysForStory() {
    this.state.ui.phoneOpen = false;
    this.state.ui.inspector = null;
    document.getElementById('game-shell')?.classList.remove('decision-tool-phone');
    this.ui.renderPhone();
    this.ui.renderInspector();
  }

  showDecision(config) {
    this.hideOverlaysForStory();
    this.decisionHandlers.set(config.id, config.onChoose);
    const { onChoose, ...renderable } = config;
    this.ui.showDecision(renderable);
    this.refreshUI();
  }

  showDialogue(config) {
    this.hideOverlaysForStory();
    this.ui.showDialogue(config);
  }

  showNarration(title, text, kicker = 'Escena de la jornada') {
    this.showDialogue({
      id: 'narration',
      kicker,
      title,
      text,
      options: [{ id: 'close', label: 'Continuar', action: 'close-dialogue' }],
    });
  }

  visitRoom(room) {
    this.state.flags.visitedRooms.add(room);
    this.ui.renderGuide();
  }

  getGPS() {
    const gps = this.world.getGPS();
    const phrases = {
      Sala: 'en la sala',
      Cocina: 'en la cocina',
      Dormitorio: 'en el dormitorio',
      Baño: 'en el baño',
      Entrada: 'en la entrada',
      Jardín: 'en el jardín',
    };
    return { ...gps, phrase: phrases[gps.room] || `en ${gps.room.toLowerCase()}` };
  }

  refillNeeded() {
    return this.state.medication.stock === 'low' || this.state.medication.stock === 'pending';
  }

  allSetupDone() {
    const flags = this.state.flags;
    return flags.visitedRooms.size >= 3
      && flags.conversed
      && flags.inspectedFixed
      && flags.inspectedWearable
      && flags.openedApp
      && flags.scheduledDose
      && flags.scheduledAppointment;
  }

  getGuideTitle() {
    const state = this.state;
    if (state.finished) return 'Jornada completada';
    if (!this.allSetupDone()) return 'Preparación de la jornada';
    if (state.flags.doseConfirmationIntent && !state.flags.doseConfirmed) return 'Confirmación de la dosis';
    if (state.flags.accompanyPending) return 'Preparativos de la cita';
    if (this.refillNeeded() && !state.flags.restockDone) return 'Reposición de medicamento';
    if (state.emergency.pendingVisit) return 'Alerta SOS activa';
    return 'Rutina del día';
  }

  getGuideItems() {
    const state = this.state;
    const flags = state.flags;
    if (state.finished) {
      return [
        { title: 'Explora libremente', hint: 'La jornada ya terminó, pero el hogar sigue disponible.', done: true },
        { title: 'Revisa el resumen', hint: 'Puedes volver a abrirlo con “Siguiente evento”.', done: true },
      ];
    }
    if (!this.allSetupDone()) {
      const visited = flags.visitedRooms.size;
      return [
        { title: 'Explora tres zonas', hint: `${visited}/3 zonas visitadas`, done: visited >= 3 },
        { title: 'Conversa con Rosa', hint: 'Haz clic en ella cuando estés cerca.', done: flags.conversed },
        { title: 'Inspecciona el dispositivo fijo', hint: 'Reloj, pastillero y tres botones físicos.', done: flags.inspectedFixed },
        { title: 'Revisa el wearable', hint: 'Haz clic en el reloj de su muñeca.', done: flags.inspectedWearable },
        { title: 'Abre la aplicación', hint: 'Pulsa P o el botón “Móvil”.', done: flags.openedApp },
        { title: 'Programa la dosis', hint: 'Agenda → Guardar dosis.', done: flags.scheduledDose },
        { title: 'Registra la cita', hint: 'Agenda → Guardar cita.', done: flags.scheduledAppointment },
      ];
    }
    if (flags.doseConfirmationIntent && !flags.doseConfirmed) {
      return [
        { title: 'Habla con Rosa', hint: 'Pregunta con calma por la toma.', done: false },
        { title: 'Revisa el estado en la app', hint: 'Distingue interacción de toma confirmada.', done: state.doseStatus === 'toma_confirmada_persona' },
      ];
    }
    if (flags.accompanyPending) {
      return [
        { title: 'Ve a la salida', hint: 'Haz clic en la puerta para acompañarla.', done: flags.accompanied },
        { title: 'Repasa la lista con Rosa', hint: state.appointmentPrep.completed ? 'Lista completa.' : 'Pregunta qué quiere llevar.', done: state.appointmentPrep.completed },
      ];
    }
    if (this.refillNeeded() && !flags.restockDone) {
      return [
        { title: 'Gestiona el aviso de reposición', hint: 'Pendiente o completada desde la app.', done: flags.restockDecision },
        { title: 'Cierra el ciclo de reposición', hint: 'Botiquín 3D o botón “Marcar completada”.', done: flags.restockDone },
      ];
    }
    if (state.emergency.pendingVisit) {
      return [
        { title: 'Consulta la ubicación GPS', hint: 'Abre la pestaña GPS en la app.', done: flags.gpsConsulted },
        { title: 'Ve junto a Rosa', hint: 'Haz clic en ella cuando llegues.', done: false },
      ];
    }
    return [
      { title: 'Consulta signos vitales', hint: 'Pulso y concentración de O₂.', done: flags.vitalsConsulted },
      { title: 'Consulta el GPS simulado', hint: 'La app sigue al wearable.', done: flags.gpsConsulted },
      { title: 'Continúa la jornada', hint: 'Usa “Siguiente evento” o deja correr el tiempo.', done: false },
    ];
  }

  getGuideNote() {
    if (this.state.setupBlocked) return 'El tiempo espera a que completes la agenda. Puedes seguir explorando.';
    if (this.state.finished) return 'Puedes seguir explorando; el tiempo ya no avanza.';
    return 'Las decisiones pausan el tiempo. No hay una única respuesta correcta.';
  }

  getPhoneHighlights() {
    const state = this.state;
    const items = [];
    const dose = state.doses[0];
    const appointment = state.appointments[0];
    if (dose && !state.flags.doseAnnounced) {
      items.push({ time: formatTime(dose.time), title: 'Dosis programada', detail: `${dose.name} · aviso visual y sonoro en el reloj.` });
    }
    if (appointment && !state.flags.appointmentAnnounced) {
      items.push({ time: formatTime(appointment.announceAt), title: 'Aviso de cita', detail: 'El dispositivo fijo anunciará la cita por voz.' });
    }
    if (appointment && state.appointmentStatus !== 'en_curso' && state.appointmentStatus !== 'cita finalizada') {
      items.push({ time: formatTime(appointment.time), title: 'Cita médica', detail: appointment.title });
    }
    if (this.refillNeeded() && !state.flags.restockDone) {
      items.push({ time: formatTime(state.time), title: 'Reposición pendiente', detail: 'Puedes marcarla como completada desde la app.' });
    }
    if (state.emergency.active) {
      items.push({ time: formatTime(state.emergency.at || state.time), title: 'Alerta SOS', detail: 'GPS y signos vitales disponibles.' });
    }
    if (!items.length) {
      items.push({ time: '18:00', title: 'Resumen de la jornada', detail: 'Revisa decisiones y efectos al final del día.' });
    }
    return items.slice(0, 3);
  }

  getSummaryData() {
    const state = this.state;
    const metrics = state.metrics;
    let title = 'Una jornada de cuidado consciente';
    if (metrics.autonomy >= 4 && metrics.calm >= 3) title = 'Un día de decisiones compartidas';
    else if (metrics.workload >= 4) title = 'Un día organizado, con mucho trabajo invisible';
    const subtitle = `Registraste ${state.decisions.length} decisiones. La tecnología ayudó a ordenar los avisos, mientras Rosa mantuvo sus preferencias y su voz en cada situación.`;

    const recommendations = [];
    if (state.doseStatus === 'toma_confirmada_persona') {
      recommendations.push('Mantener la confirmación de la toma como una conversación breve y respetuosa, no como una suposición del sensor.');
    } else {
      recommendations.push('Conservar la diferencia entre “interacción completada” y “toma confirmada”; una pregunta amable puede aclarar la duda sin retirar autonomía.');
    }
    if (state.flags.accompanied) {
      recommendations.push('Seguir anticipando la salida con listas compartidas y dejar que Rosa elija sus prendas y su ritmo.');
    } else {
      recommendations.push('Preparar la cita con más tiempo y acompañar hasta la salida para reducir imprevistos sin decidir por Rosa.');
    }
    if (state.flags.gpsConsulted) {
      recommendations.push('Usar el GPS para llegar y preguntar, no para sustituir la conversación presencial.');
    } else {
      recommendations.push('Consultar el GPS antes de responder a una alerta para orientar mejor el acompañamiento.');
    }
    if (state.flags.vitalsConsulted) {
      recommendations.push('Interpretar pulso y concentración de O₂ como contexto simulado, acompañado siempre de lo que Rosa manifiesta.');
    } else {
      recommendations.push('Revisar las lecturas de pulso y concentración de O₂ antes de elegir una respuesta de emergencia.');
    }
    if (!state.flags.restockDone && this.refillNeeded()) {
      recommendations.push('Cerrar el ciclo de reposición en la app para que el estado del sistema coincida con la realidad.');
    }
    if (state.emergency.outcome.includes('sin acompañamiento')) {
      recommendations.push('Reservar unos minutos para hablar con Rosa después de una alerta, incluso si el riesgo ya pasó.');
    }

    const doseFinal = DOSE_STATUS_TEXT[state.doseStatus] || state.doseStatus;
    const appointmentFinal = state.appointments[0]
      ? `${formatTime(state.appointments[0].time)} · ${state.appointmentStatus}`
      : 'sin cita registrada';
    const emergencyFinal = state.emergency.outcome || 'sin alerta SOS durante la jornada';
    const technical = [
      `Flujo de medicamentos: ${doseFinal}. El compartimento se abrió y cerró; la app mantuvo estados distintos.`,
      `Flujo de citas: ${appointmentFinal}. El dispositivo fijo anunció la cita y permitió consultarla con su botón físico.`,
      `Wearable: GPS simulado, botón SOS, pulso y concentración de oxígeno. Última lectura: ${state.wearable.pulse} lpm y ${state.wearable.spo2}% de O₂.`,
      `Emergencia: ${emergencyFinal}. Todas las respuestas fueron simuladas.`,
      'Sincronización: la app, el reloj fijo y el wearable compartieron eventos mediante un bus interno; no hubo hardware ni servicios externos.',
    ];
    return { title, subtitle, recommendations: recommendations.slice(0, 5), technical };
  }

  /* ------------------------------------------------------------------ *
   * Device flows.
   * ------------------------------------------------------------------ */
  startGame() {
    if (this.state.flags.introSeen) return;
    this.audio.unlock();
    this.state.flags.introSeen = true;
    this.state.ui.modal = null;
    this.state.setupBlocked = false;
    this.state.blocked = false;
    this.ui.closeModal();
    this.world.elder.setExpression('smile');
    this.world.elder.setPose('talk', 4);
    this.bus.emit('system:started', { at: formatTime(this.state.time) });
    addSync(this.state, 'Jornada iniciada. Los tres dispositivos están sincronizados.');
    notify(this.state, this.bus, {
      type: 'info',
      icon: '☀',
      title: 'Bienvenido a la jornada',
      body: 'Explora la casa, conoce a Rosa y configura la dosis y la cita desde la app.',
      actions: [{ label: 'Abrir Agenda', action: 'phone-tab', data: { tab: 'agenda' } }],
    });
    this.audio.beep('info');
    this.ui.showCaption('Explora la vivienda. Los anillos indican objetos interactivos.', 5500);
    this.refreshUI();
  }

  openPhoneTab(tab = 'home', options = {}) {
    if (this.state.ui.modal === 'intro' || this.state.ui.modal === 'summary') return;
    this.state.flags.openedApp = true;
    this.state.ui.activeTab = tab;
    this.state.ui.phoneOpen = true;
    if (tab === 'health') this.markVitalsConsulted();
    if (tab === 'map') this.consultGPS();
    const decisionMode = Boolean(this.state.ui.activeDecision) && !options.noDecisionMode;
    document.getElementById('game-shell')?.classList.toggle('decision-tool-phone', decisionMode);
    this.ui.renderPhone();
    this.ui.renderGuide();
    this.ui.renderHUD();
    this.syncTimeBlocking();
  }

  closePhone(check = true) {
    const wasOpen = this.state.ui.phoneOpen;
    this.state.ui.phoneOpen = false;
    document.getElementById('game-shell')?.classList.remove('decision-tool-phone');
    this.ui.renderPhone();
    this.ui.renderHUD();
    this.syncTimeBlocking();
    if (check && wasOpen) this.checkEvents();
  }

  togglePhone() {
    if (this.state.ui.modal === 'intro' || this.state.ui.modal === 'summary') return;
    if (this.state.ui.phoneOpen) this.closePhone();
    else this.openPhoneTab(this.state.ui.activeTab || 'home');
  }

  consultGPS() {
    if (!this.state.flags.gpsConsulted) {
      this.state.flags.gpsConsulted = true;
      const gps = this.getGPS();
      addSync(this.state, `Wearable → App: ubicación GPS consultada (${gps.room}).`);
      notify(this.state, this.bus, {
        type: 'info',
        icon: '◎',
        title: 'Ubicación consultada',
        body: `Rosa está ${gps.phrase}. El GPS es una representación interna de la simulación.`,
      });
      this.ui.renderGuide();
    }
  }

  markVitalsConsulted() {
    if (this.state.flags.vitalsConsulted) return;
    this.state.flags.vitalsConsulted = true;
    addSync(this.state, 'Wearable → App: signos vitales consultados por el cuidador.');
    this.ui.renderGuide();
  }

  updateVitals(pulse, spo2, note = 'Lectura simulada', log = true) {
    this.bus.emit('wearable:vitals', { pulse, spo2, note, log });
  }

  periodicVitals(pulse, spo2, note) {
    this.updateVitals(pulse, spo2, note, true);
    this.state.npcActivity = `Rosa continúa su rutina · ${note.toLowerCase()}`;
  }

  manualVitalsUpdate() {
    const emergency = this.state.emergency.active;
    const pulse = emergency ? 108 : 72 + Math.round(Math.random() * 9);
    const spo2 = emergency ? 97 : 97 + Math.round(Math.random());
    this.updateVitals(pulse, spo2, 'Lectura manual del cuidador', true);
    notify(this.state, this.bus, {
      type: 'info',
      icon: '♥',
      title: 'Nueva lectura simulada',
      body: `Pulso ${pulse} lpm · concentración de O₂ ${spo2}%.`,
    });
  }

  announce(text, mode = 'announcement', statusText = 'Aviso de voz', sound = 'info', options = {}) {
    this.bus.emit('device:announce', {
      text,
      mode,
      statusText,
      sound,
      log: options.log !== false,
      duration: options.duration || 7000,
    });
  }

  repeatAnnouncement() {
    const text = this.state.device.lastAnnouncement || 'No hay avisos recientes.';
    this.announce(text, 'announcement', 'Repetición del último aviso', 'info', { log: false });
  }

  setDoseStatus(status, message = null, statusText = null) {
    this.bus.emit('dose:status', { status, message, statusText });
  }

  setMedicationStatus(status, note, message) {
    this.bus.emit('medication:status', { status, note, message });
  }

  scheduleDose() {
    if (this.state.flags.scheduledDose) return;
    const draft = this.state.ui.draftDose || { med: 'Losartán 50 mg', time: '540' };
    let time = Number(draft.time) || 9 * 60;
    if (time <= this.state.time) time = Math.min(10 * 60 + 30, Math.ceil(this.state.time) + 10);
    const dose = {
      name: draft.med || 'Losartán 50 mg',
      time,
      compartmentIndex: 0,
    };
    this.state.doses = [dose];
    this.state.flags.scheduledDose = true;
    this.state.device.compartmentIndex = dose.compartmentIndex;
    this.state.medication.name = dose.name;
    this.bus.emit('dose:scheduled', { dose });
    notify(this.state, this.bus, {
      type: 'success',
      icon: '✓',
      title: 'Dosis sincronizada',
      body: `${dose.name} a las ${formatTime(dose.time)}. El reloj fijo abrirá el compartimento cuando llegue la hora.`,
      actions: [{ label: 'Ver dispositivo', action: 'inspect-fixed' }],
    });
    this.audio.beep('success');
    this.releaseSetupGateIfPossible();
    this.ui.renderPhone();
    this.checkEvents();
  }

  scheduleAppointment() {
    if (this.state.flags.scheduledAppointment) return;
    const draft = this.state.ui.draftAppointment || { title: 'Control con la doctora Ruiz', time: '690' };
    let time = Number(draft.time) || 11 * 60 + 30;
    if (time <= this.state.time + 20) time = Math.min(13 * 60, Math.ceil(this.state.time) + 25);
    const announceAt = Math.max(Math.ceil(this.state.time) + 5, time - 30);
    const prepareAt = Math.min(time - 1, Math.max(announceAt + 5, time - 15));
    const appointment = {
      title: draft.title || 'Control con la doctora Ruiz',
      time,
      announceAt,
      prepareAt,
    };
    this.state.appointments = [appointment];
    this.state.flags.scheduledAppointment = true;
    this.bus.emit('appointment:scheduled', { appointment });
    notify(this.state, this.bus, {
      type: 'success',
      icon: '✓',
      title: 'Cita sincronizada',
      body: `${appointment.title} a las ${formatTime(appointment.time)}. El reloj avisará a las ${formatTime(appointment.announceAt)}.`,
      actions: [{ label: 'Escuchar citas', action: 'fixed-appointments' }],
    });
    this.audio.beep('success');
    this.releaseSetupGateIfPossible();
    this.ui.renderPhone();
    this.checkEvents();
  }

  fixedBack() {
    this.world.pressButton('fixed.back');
    this.world.setDeviceMode('clock', 'Buenos días, Rosa', this.state.device.statusText || 'Reloj activo');
    addSync(this.state, 'Dispositivo fijo: vuelta al modo reloj desde el botón verde.');
    this.ui.showCaption('El dispositivo fijo vuelve al modo reloj.', 3000);
    this.refreshUI();
  }

  fixedAppointments() {
    this.world.pressButton('fixed.appointments');
    const appointment = this.state.appointments[0];
    const text = appointment
      ? `Próxima cita: ${formatTime(appointment.time)}. ${appointment.title}.`
      : 'No hay citas médicas programadas.';
    this.announce(text, 'appointments', appointment ? 'Cita sincronizada con la app' : 'Sin citas', 'info', { log: false });
    addSync(this.state, 'Dispositivo fijo → App: consulta de próximas citas desde el botón azul.');
    this.refreshUI();
  }

  fixedEmpty() {
    this.world.pressButton('fixed.empty');
    this.reportLowStock('button');
  }

  inspect(type) {
    this.state.ui.inspector = type;
    this.state.ui.phoneOpen = false;
    document.getElementById('game-shell')?.classList.remove('decision-tool-phone');
    if (type === 'fixed') this.state.flags.inspectedFixed = true;
    if (type === 'wearable') this.state.flags.inspectedWearable = true;
    this.ui.renderPhone();
    this.ui.renderInspector();
    this.ui.renderGuide();
    this.syncTimeBlocking();
  }

  closeInspector(check = true) {
    this.state.ui.inspector = null;
    this.ui.renderInspector();
    this.syncTimeBlocking();
    if (check) this.checkEvents();
  }

  interact(id) {
    if (id.startsWith('fixed.') || id === 'wearable.sos') this.world.pressButton(id);
    switch (id) {
      case 'fixed':
        this.inspect('fixed');
        break;
      case 'fixed.back':
        this.fixedBack();
        break;
      case 'fixed.appointments':
        this.fixedAppointments();
        break;
      case 'fixed.empty':
        this.fixedEmpty();
        break;
      case 'wearable':
        this.inspect('wearable');
        break;
      case 'wearable.sos':
        this.triggerSOS('manual');
        break;
      case 'elder':
        this.showElderConversation();
        break;
      case 'phone3d':
        this.togglePhone();
        break;
      case 'cabinet':
        this.interactCabinet();
        break;
      case 'door':
        this.interactDoor();
        break;
      case 'calendar':
        this.inspect('calendar');
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ *
   * Daily activities and narrative decisions.
   * ------------------------------------------------------------------ */
  startBreakfast() {
    this.world.elderGo('kitchen', {
      pose: 'talk',
      duration: 9,
      expression: 'smile',
      activity: 'preparando su desayuno',
    });
    this.controls.focusOn(5.1, -2.2, 3);
    this.showDecision({
      id: 'breakfast',
      kicker: '08:25 · Escena cotidiana',
      title: 'Rosa prepara su desayuno',
      context: 'Rosa se mueve con calma por la cocina. Le gusta preparar su desayuno a su manera; hoy también quiere regar las plantas antes de la consulta.',
      quote: 'Buenos días, Álex. Ya casi tengo el desayuno listo. No te preocupes, todavía puedo hacerlo yo.',
      options: [
        { id: 'ask', label: 'Preguntar si quiere ayuda', detail: 'Ofrecer apoyo sin tomar el control de la actividad.', tag: 'Autonomía' },
        { id: 'prepare', label: 'Preparar el desayuno por ella', detail: 'Ahorra tiempo, pero decide en lugar de Rosa.', tag: 'Rutina' },
        { id: 'observe', label: 'Acompañar cerca sin intervenir', detail: 'Deja que continúe y observa desde la app.', tag: 'Independencia' },
      ],
      onChoose: (choice) => {
        const choices = {
          ask: { label: 'Preguntar si quiere ayuda', effects: { autonomy: 1, calm: 1 }, reflection: 'Rosa agradeció que le preguntaras antes de intervenir.' },
          prepare: { label: 'Preparar el desayuno por ella', effects: { autonomy: -1, routine: 1, workload: 1 }, reflection: 'La rutina avanzó rápido, pero Rosa perdió una decisión cotidiana.' },
          observe: { label: 'Acompañar cerca sin intervenir', effects: { autonomy: 2, calm: -1, workload: -1 }, reflection: 'Rosa mantuvo su ritmo; te quedaste atento por si necesitaba apoyo.' },
        };
        const selected = choices[choice] || choices.ask;
        applyEffects(this.state, selected.effects, this.bus);
        recordDecision(this.state, {
          id: 'breakfast',
          title: 'Desayuno de Rosa',
          choice: selected.label,
          reflection: selected.reflection,
          effects: selected.effects,
        });
        this.world.elder.setExpression('smile');
        this.refreshUI();
      },
    });
  }

  startDoseFlow() {
    const dose = this.state.doses[0];
    if (!dose) return;
    this.state.flags.doseAnnounced = true;
    this.setDoseStatus('aviso_enviado', 'App → Dispositivo fijo: hora de dosis alcanzada.', 'Aviso sonoro y visual activado');
    this.announce(`Rosa, es hora de tomar ${dose.name}.`, 'dose', 'Aviso de dosis activado', 'reminder');
    notify(this.state, this.bus, {
      type: 'reminder',
      icon: '◔',
      title: 'Hora de la dosis',
      body: `El reloj avisa a Rosa: ${dose.name}. El pastillero abrirá el compartimento correspondiente.`,
      actions: [{ label: 'Ver estado', action: 'phone-tab', data: { tab: 'system' } }],
    });
    this.controls.focusOn(2.2, -1.2, 3);
    this.world.elderGo('device', {
      pose: 'takePill',
      duration: 4.5,
      expression: 'smile',
      activity: 'retirando la pastilla del compartimento',
      onArrive: () => {
        this.world.setCompartment(true, true);
        this.setDoseStatus('compartimento_abierto', 'Dispositivo fijo → App: compartimento de la dosis abierto.', 'Compartimento abierto · pastilla disponible');
        this.world.setDeviceMode('dose', `Retira la pastilla: ${dose.name}`, 'Compartimento abierto');
        notify(this.state, this.bus, {
          type: 'info',
          icon: '▣',
          title: 'Compartimento abierto',
          body: 'El dispositivo fijo abrió el compartimento programado. Retirar la pastilla será una interacción, no una prueba de ingesta.',
        });
      },
      onDone: () => {
        this.state.device.pillInCompartment = false;
        this.world.setCompartment(false, false);
        this.setDoseStatus('interaccion_completada', 'Dispositivo fijo → App: interacción completada; ingesta no verificada.', DOSE_STATUS_TEXT.interaccion_completada);
        this.world.setDeviceMode('clock', 'Buenos días, Rosa', DOSE_STATUS_TEXT.interaccion_completada);
        notify(this.state, this.bus, {
          type: 'reminder',
          icon: '◐',
          title: 'Interacción completada',
          body: 'El compartimento se cerró. La app NO marca la toma como confirmada: retirar la pastilla no demuestra que se haya ingerido.',
          actions: [{ label: 'Ver flujo', action: 'phone-tab', data: { tab: 'system' } }],
        });
        this.addTimer(1.2, () => this.showDoseDecision());
      },
    });
  }

  showDoseDecision() {
    this.showDecision({
      id: 'dose',
      kicker: `${formatTime(this.state.time)} · Decisión sobre la dosis`,
      title: '¿Cómo registrar la toma?',
      context: 'La app muestra “Interacción completada”. El pastillero detectó que se retiró la pastilla, pero no puede saber si Rosa la tomó. La confirmación debe venir de una conversación.',
      quote: 'Rosa sigue en la cocina. Prefiere que le pregunten directamente, sin dar por hecho nada.',
      tools: [{ id: 'view-system', label: 'Ver estado en la app' }],
      options: [
        { id: 'ask', label: 'Acercarse y preguntar a Rosa', detail: 'La app esperará su respuesta antes de cambiar el estado.', tag: 'Conversación' },
        { id: 'water', label: 'Ofrecer agua y confirmar juntos', detail: 'Rosa confirma verbalmente la toma; queda registrada como autodeclarada.', tag: 'Acompañamiento' },
        { id: 'record', label: 'Conservar solo la interacción', detail: 'Respetar su privacidad; la ingesta queda sin confirmar.', tag: 'Privacidad' },
      ],
      footnote: 'Ningún sensor confirma la ingesta. “Toma confirmada por Rosa” significa una declaración de la persona, no una medición.',
      onChoose: (choice) => {
        if (choice === 'ask') {
          this.state.flags.doseConfirmationIntent = true;
          applyEffects(this.state, { autonomy: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'dose',
            title: 'Registro de la dosis',
            choice: 'Acercarse y preguntar a Rosa',
            reflection: 'Elegiste una confirmación conversacional; queda pendiente hablar con Rosa.',
            effects: { autonomy: 1 },
          });
          const elder = this.world.elder.group.position;
          this.controls.focusOn(elder.x, elder.z, 3);
          notify(this.state, this.bus, {
            type: 'reminder',
            icon: 'R',
            title: 'Habla con Rosa',
            body: 'Haz clic en Rosa cuando estés cerca para preguntarle si tomó la pastilla.',
            actions: [{ label: 'Ir junto a Rosa', action: 'approach-elder' }],
          });
        } else if (choice === 'water') {
          applyEffects(this.state, { autonomy: 1, workload: 1 }, this.bus);
          this.confirmDoseByPerson();
          recordDecision(this.state, {
            id: 'dose',
            title: 'Registro de la dosis',
            choice: 'Ofrecer agua y confirmar juntos',
            reflection: 'Rosa confirmó verbalmente la toma; se registró como autodeclarada.',
            effects: { autonomy: 1, workload: 1 },
          });
          this.showNarration(
            'Una confirmación sencilla',
            'Rosa: “Sí, Álex, ya la tomé con agua. Gracias por preguntar y no darlo por hecho.” La app cambia el estado a “Toma confirmada por Rosa”.',
            'Rosa',
          );
        } else {
          applyEffects(this.state, { autonomy: 2, calm: -1, workload: -1 }, this.bus);
          recordDecision(this.state, {
            id: 'dose',
            title: 'Registro de la dosis',
            choice: 'Conservar solo la interacción',
            reflection: 'Se respetó la privacidad; la app mantiene la ingesta como no confirmada.',
            effects: { autonomy: 2, calm: -1, workload: -1 },
          });
          this.ui.showCaption('Estado conservado: interacción completada, toma no confirmada.', 5000);
        }
        this.refreshUI();
      },
    });
  }

  confirmDoseByPerson() {
    this.state.flags.doseConfirmationIntent = false;
    this.state.flags.doseConfirmed = true;
    this.setDoseStatus(
      'toma_confirmada_persona',
      'App: Rosa confirma verbalmente la toma. La confirmación es autodeclarada, no una detección automática.',
      DOSE_STATUS_TEXT.toma_confirmada_persona,
    );
    applyEffects(this.state, { calm: 1, routine: 1 }, this.bus);
    notify(this.state, this.bus, {
      type: 'success',
      icon: '✓',
      title: 'Toma confirmada por Rosa',
      body: 'La app distingue la confirmación declarada por la persona de la interacción con el compartimento.',
    });
    this.refreshUI();
  }

  startAppointmentAnnouncement() {
    const appointment = this.state.appointments[0];
    if (!appointment) return;
    this.state.flags.appointmentAnnounced = true;
    this.bus.emit('appointment:status', { status: 'anunciada', message: 'Dispositivo fijo → App: cita anunciada por voz.' });
    this.announce(
      `Rosa, recuerda que a las ${formatTime(appointment.time)} tienes ${appointment.title}.`,
      'announcement',
      'Cita anunciada por voz',
      'reminder',
    );
    notify(this.state, this.bus, {
      type: 'reminder',
      icon: '▦',
      title: 'Cita próxima',
      body: `El dispositivo fijo anunció: ${appointment.title} a las ${formatTime(appointment.time)}.`,
      actions: [{ label: 'Consultar citas', action: 'fixed-appointments' }],
    });
    this.world.elderGo('device', {
      pose: 'pressButton',
      duration: 3,
      expression: 'smile',
      activity: 'consultando sus próximas citas',
      onArrive: () => this.world.pressButton('fixed.appointments'),
      onDone: () => this.world.setDeviceMode('appointments', `Próxima cita: ${formatTime(appointment.time)}`, 'Consulta desde botón azul'),
    });
    this.controls.focusOn(2.2, -1.2, 2.5);
  }

  showPreparationDecision() {
    const appointment = this.state.appointments[0];
    if (!appointment) return;
    this.state.flags.preparationDecision = true;
    this.state.flags.accompanyPending = true;
    this.bus.emit('appointment:status', { status: 'preparación', message: 'App: comienza la preparación para la cita.' });
    this.world.elderGo('entrance', {
      pose: 'ready',
      duration: 14,
      expression: 'smile',
      activity: 'preparándose para salir',
    });
    this.controls.focusOn(7, 5.5, 3);
    notify(this.state, this.bus, {
      type: 'info',
      icon: '↗',
      title: 'Rosa se prepara para salir',
      body: 'Puedes acompañarla hasta la puerta cuando esté lista.',
      actions: [{ label: 'Ir a la salida', action: 'go-door' }],
    });
    this.showDecision({
      id: 'preparation',
      kicker: `${formatTime(this.state.time)} · Preparativos de la cita`,
      title: '¿Cómo acompañar la preparación?',
      context: `Faltan unos minutos para ${appointment.title}. Rosa quiere llevar su chaqueta azul y revisar sus cosas; le molesta que decidan por ella.`,
      quote: '“Sé qué necesito llevar. Si me ayudas, pregúntame primero, por favor.”',
      tools: [{ id: 'view-agenda', label: 'Ver agenda en la app' }],
      options: [
        { id: 'ask', label: 'Preguntar qué necesita y esperar', detail: 'Rosa elige sus prendas y marca su propio ritmo.', tag: 'Dignidad' },
        { id: 'prepare', label: 'Preparar sus cosas sin preguntar', detail: 'La salida estará lista antes, con menos participación de Rosa.', tag: 'Rapidez' },
        { id: 'checklist', label: 'Repasar una lista juntos en la app', detail: 'La app muestra una lista interactiva que deben completar.', tag: 'Organización' },
      ],
      onChoose: (choice) => {
        const choices = {
          ask: { label: 'Preguntar qué necesita y esperar', effects: { autonomy: 2, calm: 1 }, reflection: 'Rosa eligió su chaqueta y se sintió escuchada.' },
          prepare: { label: 'Preparar sus cosas sin preguntar', effects: { autonomy: -1, routine: 2, workload: 1 }, reflection: 'Todo estuvo listo, pero Rosa participó menos de la decisión.' },
          checklist: { label: 'Repasar una lista juntos en la app', effects: { autonomy: 1, routine: 2, calm: 1 }, reflection: 'La lista compartió organización sin quitarle la última palabra.' },
        };
        const selected = choices[choice] || choices.ask;
        applyEffects(this.state, selected.effects, this.bus);
        recordDecision(this.state, {
          id: 'preparation',
          title: 'Preparación para la cita',
          choice: selected.label,
          reflection: selected.reflection,
          effects: selected.effects,
        });
        if (choice === 'checklist') {
          this.state.appointmentPrep.mode = 'juntos';
          this.state.appointmentPrep.completed = false;
          this.openPhoneTab('agenda');
          this.ui.showCaption('Marca la lista junto a Rosa en la Agenda. Cierra el móvil para seguir explorando.', 6500);
        } else {
          this.showNarration(
            'Rosa se prepara',
            choice === 'ask'
              ? 'Rosa elige su chaqueta azul y guarda sus cosas. “Gracias por dejarme decidir”, dice con una sonrisa.'
              : 'Las cosas quedan listas junto a la puerta. Rosa agradece la ayuda, aunque hubiera preferido elegir su chaqueta.',
            'Rosa',
          );
        }
        this.refreshUI();
      },
    });
  }

  toggleCheck(item) {
    const prep = this.state.appointmentPrep;
    if (!prep.checklist || !(item in prep.checklist)) return;
    prep.checklist[item] = !prep.checklist[item];
    const complete = Object.values(prep.checklist).every(Boolean);
    if (complete && !prep.completed) {
      prep.completed = true;
      applyEffects(this.state, { routine: 1, calm: 1 }, this.bus);
      this.bus.emit('appointment:status', { status: 'preparación completada', message: 'App → Cuidador: lista de salida repasada con Rosa.' });
      recordDecision(this.state, {
        id: 'checklist',
        title: 'Lista de salida',
        choice: 'Repasar los tres objetos con Rosa',
        reflection: 'La lista dio orden a la salida y respetó las preferencias de Rosa.',
        effects: { routine: 1, calm: 1 },
      });
      notify(this.state, this.bus, {
        type: 'success',
        icon: '✓',
        title: 'Lista completa',
        body: 'Rosa y Álex revisaron documento, chaqueta y llaves. Aún puedes acompañarla a la puerta.',
        actions: [{ label: 'Ir a la salida', action: 'go-door' }],
      });
    }
    this.refreshUI();
  }

  interactDoor() {
    if (!this.state.flags.accompanyPending) {
      this.showNarration('La salida', 'La puerta está lista. Cuando se acerque la hora de la cita, Rosa vendrá hasta aquí para salir.', 'Hogar de Rosa');
      return;
    }
    this.state.flags.accompanyPending = false;
    this.state.flags.accompanied = true;
    applyEffects(this.state, { routine: 1, calm: 1 }, this.bus);
    this.bus.emit('appointment:status', { status: 'acompañada', message: 'Cuidador: Rosa fue acompañada hasta la salida.' });
    recordDecision(this.state, {
      id: 'accompany',
      title: 'Acompañamiento a la salida',
      choice: 'Caminar con Rosa hasta la puerta',
      reflection: 'La salida fue puntual y Rosa mantuvo sus decisiones.',
      effects: { routine: 1, calm: 1 },
    });
    this.world.elder.setExpression('smile');
    this.showDialogue({
      id: 'door',
      kicker: 'Rosa',
      title: 'Un camino corto juntos',
      text: 'Rosa: “Gracias por caminar conmigo. Me gusta llegar temprano, pero también me gusta ir a mi paso.”',
      options: [{ id: 'close', label: 'Continuar', action: 'close-dialogue' }],
    });
    this.refreshUI();
  }

  appointmentStart() {
    const appointment = this.state.appointments[0];
    this.state.flags.accompanyPending = false;
    this.bus.emit('appointment:status', { status: 'en_curso', message: 'App: cita médica en curso (simulada).' });
    notify(this.state, this.bus, {
      type: 'info',
      icon: '▦',
      title: 'Cita en curso',
      body: appointment ? `${appointment.title} · ${formatTime(appointment.time)}. La salida y el regreso se representan de forma resumida.` : 'La cita se representa de forma resumida.',
    });
    this.world.elderGo('entrance', {
      pose: 'ready',
      duration: 6,
      expression: 'smile',
      activity: 'lista para su cita',
      onDone: () => this.world.elderGo('sofa', { pose: 'rest', duration: 8, expression: 'smile', activity: 'de vuelta en la sala' }),
    });
  }

  startAutonomyMoment() {
    this.world.elderGo('plant', {
      pose: 'water',
      duration: 9,
      expression: 'smile',
      activity: 'regando sus plantas',
    });
    this.state.npcActivity = 'Rosa riega sus plantas en el jardín';
    applyEffects(this.state, { autonomy: 1 }, this.bus);
    notify(this.state, this.bus, {
      type: 'info',
      icon: '🌿',
      title: 'Un momento de autonomía',
      body: 'Rosa cuida sus plantas sin ayuda. La tecnología no interrumpe una actividad que ella disfruta.',
      actions: [{ label: 'Ver GPS', action: 'phone-tab', data: { tab: 'map' } }],
    });
  }

  reportLowStock(source) {
    if (this.state.flags.lowStockReported) {
      this.ui.showCaption('El aviso de medicamento agotado ya fue enviado a la app.', 3200);
      return;
    }
    this.state.flags.lowStockReported = true;
    this.state.firedEvents.add('lowStock');
    this.setMedicationStatus('low', 'Rosa lo indicó desde el botón ámbar.', 'Dispositivo fijo → App: Rosa indica que un medicamento se ha agotado.');
    this.world.setDeviceMode('empty', 'Aviso de medicamento agotado enviado', 'La app recibió la notificación');
    this.audio.beep('reminder');
    notify(this.state, this.bus, {
      type: 'reminder',
      icon: '↻',
      title: 'Medicamento agotado',
      body: `${this.state.medication.name}: Rosa lo indicó desde el dispositivo fijo. Puedes marcar la reposición como pendiente o completada.`,
      actions: [
        { label: 'Marcar pendiente', action: 'mark-restock-pending' },
        { label: 'Marcar completada', action: 'mark-restock-done' },
      ],
    });
    const showDecision = () => this.showRestockDecision();
    if (source === 'scheduled') {
      this.world.elderGo('device', {
        pose: 'pressButton',
        duration: 3,
        expression: 'neutral',
        activity: 'avisando que el medicamento se agotó',
        onArrive: () => this.world.pressButton('fixed.empty'),
        onDone: showDecision,
      });
      this.controls.focusOn(2.2, -1.2, 3);
    } else {
      this.world.pressButton('fixed.empty');
      this.addTimer(0.9, showDecision);
    }
    this.refreshUI();
  }

  showRestockDecision() {
    if (this.state.flags.restockDone) return;
    this.showDecision({
      id: 'restock',
      kicker: `${formatTime(this.state.time)} · Reposición`,
      title: 'El medicamento se está agotando',
      context: 'La app recibió el evento del botón ámbar. Marcar la reposición como completada es un registro del cuidador; también puedes usar el botiquín de la cocina para representar la acción física.',
      quote: 'Rosa: “Yo sé dónde guardo las cajas. Si quieres, vamos juntos al botiquín.”',
      tools: [{ id: 'view-agenda', label: 'Ver aviso en la app' }],
      options: [
        { id: 'pending', label: 'Marcar pendiente y organizar', detail: 'Deja constancia en la app y decide el momento de la reposición.', tag: 'Planificación' },
        { id: 'withRosa', label: 'Acompañar a Rosa al botiquín', detail: 'Rosa participa y el sistema registra la reposición al terminar.', tag: 'Autonomía' },
        { id: 'myself', label: 'Ir al botiquín y reponer', detail: 'El cuidador se encarga; aumenta su carga de trabajo.', tag: 'Acción directa' },
      ],
      onChoose: (choice) => {
        this.state.flags.restockDecision = true;
        this.setMedicationStatus('pending', 'Reposición en gestión.', 'App: reposición marcada como pendiente.');
        if (choice === 'pending') {
          applyEffects(this.state, { routine: 1, workload: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'restock',
            title: 'Reposición de medicamento',
            choice: 'Marcar pendiente y organizar',
            reflection: 'El aviso quedó registrado. Falta cerrar la reposición.',
            effects: { routine: 1, workload: 1 },
          });
          notify(this.state, this.bus, {
            type: 'reminder',
            icon: '↻',
            title: 'Reposición pendiente',
            body: 'Puedes completarla desde la app o haciendo clic en el botiquín de la cocina.',
            actions: [
              { label: 'Ir al botiquín', action: 'go-cabinet' },
              { label: 'Marcar completada', action: 'mark-restock-done' },
            ],
          });
        } else if (choice === 'withRosa') {
          applyEffects(this.state, { autonomy: 1, routine: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'restock',
            title: 'Reposición de medicamento',
            choice: 'Acompañar a Rosa al botiquín',
            reflection: 'Rosa participó en la reposición y mantuvo su conocimiento de la rutina.',
            effects: { autonomy: 1, routine: 1 },
          });
          this.world.elderGo('cabinet', {
            pose: 'pressButton',
            duration: 3.5,
            expression: 'smile',
            activity: 'reponiendo el medicamento con Álex',
            onDone: () => this.completeRestock('rosa'),
          });
          this.controls.focusOn(8.05, -4.75, 3);
          this.showNarration('Una tarea compartida', 'Rosa: “Ven, la caja está aquí. Así no se nos olvida.” Ambos se dirigen al botiquín de la cocina.', 'Rosa');
        } else {
          applyEffects(this.state, { workload: 1, routine: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'restock',
            title: 'Reposición de medicamento',
            choice: 'Ir al botiquín y reponer',
            reflection: 'Álex asumió la tarea. El sistema espera la interacción con el botiquín.',
            effects: { workload: 1, routine: 1 },
          });
          this.closePhone(false);
          this.controls.approach('cabinet');
          this.ui.showCaption('Ve al botiquín de la cocina y haz clic en él para registrar la reposición.', 6000);
        }
        this.refreshUI();
      },
    });
  }

  markRestockPending() {
    if (this.state.flags.restockDone) return;
    this.state.flags.restockDecision = true;
    this.setMedicationStatus('pending', 'Pendiente de reposición.', 'App: reposición marcada como pendiente por el cuidador.');
    notify(this.state, this.bus, {
      type: 'reminder',
      icon: '↻',
      title: 'Reposición pendiente',
      body: 'Puedes completarla desde la app o usando el botiquín 3D.',
      actions: [
        { label: 'Ir al botiquín', action: 'go-cabinet' },
        { label: 'Marcar completada', action: 'mark-restock-done' },
      ],
    });
  }

  completeRestock(method) {
    if (this.state.flags.restockDone) return;
    this.state.flags.restockDone = true;
    this.state.flags.restockDecision = true;
    const notes = {
      app: 'Registrada manualmente por el cuidador.',
      botiquin: 'Reposición representada en el botiquín de la cocina.',
      rosa: 'Rosa y Álex repusieron juntos el medicamento.',
    };
    this.setMedicationStatus(
      'restocked',
      notes[method] || 'Reposición completada.',
      `App: reposición registrada como completada (${method}).`,
    );
    applyEffects(this.state, { calm: 1, routine: 1 }, this.bus);
    this.world.setDeviceMode('empty', 'Reposición registrada como completada', 'Aplicación actualizada');
    notify(this.state, this.bus, {
      type: 'success',
      icon: '✓',
      title: 'Reposición completada',
      body: `${notes[method] || 'Reposición completada.'} El estado del medicamento está sincronizado.`,
    });
    this.addTimer(5, () => {
      if (!this.state.emergency.active) this.world.setDeviceMode('clock', 'Buenos días, Rosa', 'Medicamento disponible');
    });
    this.refreshUI();
  }

  interactCabinet() {
    if (this.refillNeeded() && !this.state.flags.restockDone) {
      this.completeRestock('botiquin');
      this.showNarration(
        'Botiquín actualizado',
        'Colocas una nueva caja en su lugar. La app cambia el estado a “reposición completada” y el dispositivo fijo recibe el resultado.',
        'Botiquín de la cocina',
      );
    } else {
      this.showNarration(
        'Botiquín en orden',
        'El botiquín está organizado y no hay reposiciones pendientes. Rosa sabe dónde está cada cosa.',
        'Botiquín de la cocina',
      );
    }
  }

  triggerSOS(source) {
    if (this.state.flags.emergencyTriggered) {
      if (this.state.emergency.active) this.ui.showCaption('Ya hay una alerta SOS activa. Respondamos primero.', 3500);
      return;
    }
    this.state.flags.emergencyTriggered = true;
    this.state.firedEvents.add('emergency');
    this.audio.beep('wearable');
    if (source === 'scheduled') {
      this.state.npcActivity = 'Rosa se dirige al jardín';
      this.world.elderGo('garden', {
        pose: 'sos',
        duration: 12,
        expression: 'concerned',
        activity: 'activando el botón SOS',
        onArrive: () => this.activateSOS(source),
      });
      this.controls.focusOn(5.1, 8.45, 4);
      notify(this.state, this.bus, {
        type: 'reminder',
        icon: '◎',
        title: 'Rosa salió al jardín',
        body: 'El wearable sigue compartiendo su ubicación simulada con la app.',
        actions: [{ label: 'Ver GPS', action: 'phone-tab', data: { tab: 'map' } }],
      });
    } else {
      this.activateSOS(source);
    }
  }

  activateSOS(source) {
    this.world.pressButton('wearable.sos');
    this.world.elder.setPose('sos', 9);
    this.world.elder.setExpression('concerned');
    this.bus.emit('wearable:sos', { source });
  }

  startEmergency(source) {
    if (this.state.emergency.triggered) return;
    const gps = this.getGPS();
    this.state.emergency.triggered = true;
    this.state.emergency.active = true;
    this.state.emergency.at = this.state.time;
    this.state.emergency.location = gps;
    this.state.wearable.sos = true;
    this.state.wearable.possibleFall = true;
    this.state.npcActivity = `Alerta SOS · Rosa está ${gps.phrase}`;
    this.updateVitals(108, 97, 'Alerta SOS simulada', true);
    this.world.setDeviceMode('emergency', 'Alerta SOS en la app del cuidador', 'Consultar GPS y signos vitales');
    addSync(this.state, `Wearable → App: botón SOS pulsado (${source}). Alerta simulada con GPS.`);
    this.audio.beep('alert');
    this.ui.showCaption('Alerta SOS simulada. No se han enviado llamadas, mensajes ni solicitudes reales.', 8500);
    notify(this.state, this.bus, {
      type: 'emergency',
      icon: '!',
      title: 'Alerta SOS simulada',
      body: `Rosa está ${gps.phrase}. La app recibió pulso 108 lpm y O₂ 97% (datos simulados).`,
      urgent: true,
      actions: [
        { label: 'Ver GPS', action: 'phone-tab', data: { tab: 'map' } },
        { label: 'Ver signos vitales', action: 'phone-tab', data: { tab: 'health' } },
      ],
    });
    this.controls.focusOn(gps.x, gps.z, 4);
    this.showEmergencyDecision(gps);
  }

  showEmergencyDecision(gps) {
    this.showDecision({
      id: 'emergency',
      kicker: `${formatTime(this.state.time)} · Alerta del wearable`,
      title: 'Rosa ha pulsado SOS',
      context: `El wearable comparte una ubicación GPS simulada: ${gps.room}. La app muestra pulso 108 lpm y concentración de O₂ 97%. También hay una señal simulada de posible caída. Puedes consultar los datos antes de elegir una respuesta.`,
      quote: '“Álex… apreté el botón. Me mareé un momento, pero quería avisar.”',
      tools: [
        { id: 'view-gps', label: 'Consultar GPS en la app' },
        { id: 'view-vitals', label: 'Ver pulso y O₂' },
        { id: 'view-system', label: 'Ver estado del sistema' },
      ],
      options: [
        { id: 'visit', label: 'Ir a donde está Rosa y hablar', detail: 'Usa el GPS para orientarte y preguntar antes de actuar.', tag: 'Presencia' },
        { id: 'emergency', label: 'Activar contacto de emergencia', detail: 'Registra una respuesta simulada de emergencia; no realiza llamadas.', tag: 'Seguridad' },
        { id: 'call', label: 'Llamar a Rosa desde la app', detail: 'Una llamada simulada permite escuchar su versión.', tag: 'Respuesta rápida' },
      ],
      footnote: 'Ninguna opción envía llamadas, mensajes ni solicitudes reales. Los signos vitales son datos de demostración.',
      onChoose: (choice) => {
        this.state.flags.emergencyDecision = true;
        this.state.emergency.choice = choice;
        if (choice === 'visit') {
          this.state.emergency.pendingVisit = true;
          applyEffects(this.state, { autonomy: 1, workload: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'emergency',
            title: 'Respuesta a la alerta SOS',
            choice: 'Ir a donde está Rosa y hablar',
            reflection: 'El GPS orientó el recorrido; falta llegar y escuchar a Rosa.',
            effects: { autonomy: 1, workload: 1 },
          });
          notify(this.state, this.bus, {
            type: 'emergency',
            icon: '◎',
            title: 'Busca a Rosa',
            body: `Está ${gps.phrase}. Abre el GPS si necesitas orientarte y haz clic en ella al llegar.`,
            urgent: true,
            actions: [
              { label: 'Ver GPS', action: 'phone-tab', data: { tab: 'map' } },
              { label: 'Ir junto a Rosa', action: 'approach-elder' },
            ],
          });
        } else if (choice === 'emergency') {
          applyEffects(this.state, { calm: 2, autonomy: -1, workload: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'emergency',
            title: 'Respuesta a la alerta SOS',
            choice: 'Activar contacto de emergencia simulado',
            reflection: 'Se priorizó una respuesta de seguridad; Rosa participó menos en la decisión.',
            effects: { calm: 2, autonomy: -1, workload: 1 },
          });
          this.resolveEmergency({
            method: 'contacto-simulado',
            outcome: 'Se registró un contacto de emergencia simulado y Rosa recibió acompañamiento.',
            effects: {},
          });
          this.showNarration(
            'Protocolo simulado',
            'La app registra la respuesta de emergencia sin realizar ninguna llamada real. Rosa: “Estoy bien, pero gracias por actuar rápido.”',
            'Aplicación del cuidador',
          );
        } else {
          applyEffects(this.state, { calm: 1, workload: 1 }, this.bus);
          recordDecision(this.state, {
            id: 'emergency',
            title: 'Respuesta a la alerta SOS',
            choice: 'Llamada simulada desde la app',
            reflection: 'La conversación aclaró la situación, aunque no hubo presencia inmediata.',
            effects: { calm: 1, workload: 1 },
          });
          this.resolveEmergency({
            method: 'llamada-simulada',
            outcome: 'Rosa respondió por una llamada simulada y confirmó que estaba consciente.',
            effects: {},
          });
          this.showNarration(
            'La voz de Rosa',
            'Llamada simulada. Rosa: “Fue solo un mareo. Me quedaré sentada un momento”. La app mantiene el registro de la alerta atendida.',
            'Aplicación del cuidador',
          );
        }
        this.refreshUI();
      },
    });
  }

  resolveEmergency({ method, outcome, effects }) {
    this.bus.emit('emergency:resolved', { method, outcome, effects });
  }

  resolveEmergencyByVisit() {
    if (!this.state.emergency.pendingVisit || this.state.emergency.resolved) return;
    recordDecision(this.state, {
      id: 'emergency-visit',
      title: 'Encuentro tras la alerta',
      choice: 'Acudir a la ubicación GPS y hablar con Rosa',
      reflection: 'La conversación presencial aclaró la alerta sin quitarle la palabra.',
      effects: { autonomy: 1, calm: 1 },
    });
    this.resolveEmergency({
      method: 'visita-presencial',
      outcome: 'Álex llegó hasta Rosa, habló con ella y la acompañó.',
      effects: { autonomy: 1, calm: 2, routine: 1 },
    });
    this.showDialogue({
      id: 'emergency-visit',
      kicker: 'Rosa',
      title: 'Gracias por preguntar',
      text: 'Rosa: “Me mareé un momento y apreté el botón. Estoy mejor. Gracias por venir y preguntarme antes de decidir.”',
      options: [
        { id: 'stay', label: 'Quedarse un rato conversando' },
        { id: 'walk', label: 'Volver juntos a la sala' },
      ],
    });
  }

  /* ------------------------------------------------------------------ *
   * Conversations and action dispatch.
   * ------------------------------------------------------------------ */
  showElderConversation() {
    if (this.state.emergency.pendingVisit && !this.state.emergency.resolved) {
      this.resolveEmergencyByVisit();
      return;
    }
    if (this.state.flags.doseConfirmationIntent && !this.state.flags.doseConfirmed) {
      this.showDialogue({
        id: 'dose-confirm',
        kicker: 'Rosa',
        title: 'Una pregunta sencilla',
        text: 'Álex: “Rosa, el reloj dice que retiraste la pastilla. ¿Ya la tomaste?” Rosa: “Sí, la tomé con el desayuno. Gracias por preguntarme.”',
        options: [
          { id: 'confirm', label: 'Registrar la confirmación de Rosa' },
          { id: 'keep', label: 'Conservar solo la interacción' },
        ],
      });
      return;
    }
    this.showDialogue({
      id: 'elder',
      kicker: 'Rosa · 78 años',
      title: 'Un momento para conversar',
      text: 'Rosa deja a un lado su taza y te mira con una sonrisa tranquila. “Hoy quiero ir a la consulta, pero antes no quiero perderme el riego de las plantas.”',
      options: [
        { id: 'plants', label: 'Háblame de tus plantas' },
        { id: 'preferences', label: '¿Cómo prefieres que te ayude?' },
        { id: 'day', label: '¿Qué quieres hacer hoy?' },
        { id: 'close', label: 'Despedirse', action: 'close-dialogue' },
      ],
    });
  }

  handleDialogueOption(topic) {
    const dialogue = this.state.ui.activeDialogue;
    if (!dialogue) return;
    if (topic === 'close' || dialogue.id === 'narration' || dialogue.id === 'door') {
      this.ui.closeDecision();
      return;
    }

    if (dialogue.id === 'dose-confirm') {
      this.ui.closeDecision();
      this.state.flags.doseConfirmationIntent = false;
      if (topic === 'confirm') {
        this.confirmDoseByPerson();
        recordDecision(this.state, {
          id: 'dose-confirmation',
          title: 'Confirmación de la toma',
          choice: 'Registrar la respuesta de Rosa',
          reflection: 'La app registró una toma confirmada por la persona, no una detección automática.',
          effects: { calm: 1, routine: 1 },
        });
        this.showNarration('Estado actualizado', 'La app ahora distingue claramente: interacción completada y toma confirmada por Rosa (autodeclarada).', 'Aplicación del cuidador');
      } else {
        recordDecision(this.state, {
          id: 'dose-confirmation',
          title: 'Confirmación de la toma',
          choice: 'Conservar solo la interacción',
          reflection: 'Se evitó afirmar una ingesta que el sistema no puede detectar.',
          effects: {},
        });
        this.ui.showCaption('La app conserva “Interacción completada · ingesta no verificada”.', 5000);
      }
      this.refreshUI();
      return;
    }

    if (dialogue.id === 'emergency-visit') {
      this.ui.closeDecision();
      if (topic === 'stay') {
        applyEffects(this.state, { calm: 1, autonomy: 1 }, this.bus);
        this.showNarration('Un rato de calma', 'Te quedas conversando con Rosa. La alerta queda atendida y ella decide cuándo volver a caminar.', 'Rosa');
      } else {
        applyEffects(this.state, { routine: 1 }, this.bus);
        this.world.elderGo('sofa', { pose: 'rest', duration: 8, expression: 'smile', activity: 'descansando en la sala' });
        this.showNarration('De vuelta a la rutina', 'Rosa y Álex vuelven juntos a la sala. El wearable sigue mostrando la hora y nuevas lecturas simuladas.', 'Rosa');
      }
      return;
    }

    if (dialogue.id === 'elder') {
      if (!this.state.flags.conversed) {
        this.state.flags.conversed = true;
        applyEffects(this.state, { autonomy: 1, calm: 1 }, this.bus);
        this.ui.renderGuide();
      }
      const responses = {
        plants: {
          title: 'Las plantas de Rosa',
          text: 'Rosa: “Las riego yo desde hace años. Cada mañana me acuerdo de mis alumnos y de cómo crecían también a su ritmo.”',
          effects: { autonomy: 1 },
          choice: 'Escuchar la historia de sus plantas',
        },
        preferences: {
          title: 'Una ayuda respetuosa',
          text: 'Rosa: “Si ves que necesito algo, pregúntame. A veces solo quiero que me acompañes, no que lo hagas por mí.”',
          effects: { autonomy: 1, calm: 1 },
          choice: 'Preguntar cómo prefiere recibir ayuda',
        },
        day: {
          title: 'Sus planes',
          text: 'Rosa: “Después de la consulta quiero sentarme en el jardín. Y quiero elegir yo mi chaqueta azul.”',
          effects: { autonomy: 1 },
          choice: 'Escuchar sus planes del día',
        },
      };
      const response = responses[topic];
      if (!response) {
        this.ui.closeDecision();
        return;
      }
      applyEffects(this.state, response.effects, this.bus);
      recordDecision(this.state, {
        id: 'conversation',
        title: 'Conversación con Rosa',
        choice: response.choice,
        reflection: 'Conocer sus gustos ayudó a cuidar sin sustituir sus decisiones.',
        effects: response.effects,
      });
      this.showNarration(response.title, response.text, 'Rosa');
      return;
    }

    this.ui.closeDecision();
  }

  handleDecisionTool(tool) {
    const tabs = {
      'view-gps': 'map',
      'view-vitals': 'health',
      'view-system': 'system',
      'view-agenda': 'agenda',
      'view-notifications': 'home',
    };
    if (tool === 'repeat-announcement') {
      this.repeatAnnouncement();
      return;
    }
    const tab = tabs[tool];
    if (!tab) return;
    this.openPhoneTab(tab);
    this.ui.showCaption('Cierra el móvil para volver al panel de decisión.', 4500);
  }

  finishDay() {
    if (this.state.finished) return;
    if (this.state.emergency.active || this.state.emergency.pendingVisit) {
      this.resolveEmergency({
        method: 'cierre-de-jornada',
        outcome: 'La alerta se cerró al finalizar la jornada sin acompañamiento presencial.',
        effects: { calm: -1 },
      });
    }
    this.state.flags.doseConfirmationIntent = false;
    this.state.flags.accompanyPending = false;
    this.state.finished = true;
    this.state.time = END_MINUTES;
    this.state.paused = false;
    this.state.setupBlocked = false;
    this.state.ui.phoneOpen = false;
    this.state.ui.inspector = null;
    this.state.ui.activeDecision = null;
    this.state.ui.activeDialogue = null;
    this.state.ui.modal = null;
    if (this.state.appointments.length && this.state.appointmentStatus !== 'en_curso') {
      this.state.appointmentStatus = 'cita finalizada';
    }
    document.getElementById('game-shell')?.classList.remove('decision-tool-phone');
    addSync(this.state, 'Jornada finalizada. Resumen de decisiones disponible.');
    this.audio.beep('success');
    this.ui.renderAll();
    this.ui.openModal('summary');
  }

  handleAction(action, element) {
    if (!action) return;
    this.audio.unlock();
    switch (action) {
      case 'start-game':
        this.startGame();
        break;
      case 'toggle-phone':
        this.togglePhone();
        break;
      case 'close-phone':
        this.closePhone();
        break;
      case 'phone-tab':
        this.openPhoneTab(element.dataset.tab || 'home');
        break;
      case 'toggle-pause':
        this.togglePause();
        break;
      case 'set-speed':
        this.setSpeed(element.dataset.speed);
        break;
      case 'next-event':
        this.advanceToNextEvent();
        break;
      case 'open-help':
        if (!this.state.flags.introSeen || this.state.ui.activeDecision) break;
        this.ui.openModal('help');
        break;
      case 'open-settings':
        if (!this.state.flags.introSeen || this.state.ui.activeDecision) break;
        this.ui.openModal('settings');
        break;
      case 'close-modal':
        if (this.state.ui.modal === 'intro') break;
        if (this.state.ui.modal === 'summary') {
          this.ui.closeModal();
        } else {
          this.ui.closeModal();
        }
        break;
      case 'toggle-setting':
        this.toggleSetting(element.dataset.setting);
        break;
      case 'toggle-guide':
        this.state.ui.guideCollapsed = !this.state.ui.guideCollapsed;
        this.ui.renderGuide();
        break;
      case 'mark-notifications-read':
        this.state.notifications.forEach((item) => { item.read = true; });
        this.ui.renderHUD();
        this.ui.renderPhone();
        break;
      case 'schedule-dose':
        this.scheduleDose();
        break;
      case 'schedule-appointment':
        this.scheduleAppointment();
        break;
      case 'fixed-back':
        this.fixedBack();
        break;
      case 'fixed-appointments':
        this.fixedAppointments();
        break;
      case 'fixed-empty':
        this.fixedEmpty();
        break;
      case 'wearable-sos':
        this.triggerSOS('manual');
        break;
      case 'inspect-fixed':
        this.inspect('fixed');
        break;
      case 'inspect-wearable':
        this.inspect('wearable');
        break;
      case 'inspect-calendar':
        this.inspect('calendar');
        break;
      case 'close-inspector':
        this.closeInspector();
        break;
      case 'repeat-announcement':
        this.repeatAnnouncement();
        break;
      case 'test-sound':
        this.audio.beep('info');
        this.ui.showCaption('Aviso sonoro de prueba del dispositivo fijo.', 3000);
        break;
      case 'update-vitals':
        this.manualVitalsUpdate();
        break;
      case 'consult-gps':
        this.consultGPS();
        this.ui.renderPhone();
        this.ui.showCaption(`Rosa está ${this.getGPS().phrase}. GPS simulado.`, 3500);
        break;
      case 'toggle-check':
        this.toggleCheck(element.dataset.item);
        break;
      case 'mark-restock-pending':
        this.markRestockPending();
        break;
      case 'mark-restock-done':
        this.completeRestock('app');
        break;
      case 'go-cabinet':
        this.closePhone(false);
        this.controls.approach('cabinet');
        this.ui.showCaption('Caminando hacia el botiquín de la cocina…', 3500);
        break;
      case 'go-door':
        this.closePhone(false);
        this.controls.approach('door');
        this.ui.showCaption('Caminando hacia la salida…', 3500);
        break;
      case 'approach-elder':
        this.closePhone(false);
        this.controls.approach('elder');
        this.ui.showCaption('Caminando hacia Rosa…', 3500);
        break;
      case 'decision-choice': {
        const decision = this.state.ui.activeDecision;
        if (!decision) break;
        const handler = this.decisionHandlers.get(decision.id);
        const choice = element.dataset.choice;
        this.decisionHandlers.delete(decision.id);
        this.ui.closeDecision();
        handler?.(choice);
        this.refreshUI();
        break;
      }
      case 'decision-tool':
        this.handleDecisionTool(element.dataset.tool);
        break;
      case 'dialogue-option':
        this.handleDialogueOption(element.dataset.topic);
        break;
      case 'close-dialogue':
        this.ui.closeDecision();
        break;
      case 'summary-continue':
        this.ui.closeModal();
        this.ui.showCaption('Puedes seguir explorando la vivienda; el tiempo de la jornada ya terminó.', 5000);
        this.refreshUI();
        break;
      case 'open-summary':
        if (this.state.finished) this.ui.openModal('summary');
        break;
      case 'restart':
        window.location.reload();
        break;
      case 'escape':
        this.handleEscape();
        break;
      default:
        console.warn(`Acción no reconocida: ${action}`);
        break;
    }
  }

  toggleSetting(setting) {
    const settings = this.state.ui.settings;
    if (!(setting in settings)) return;
    settings[setting] = !settings[setting];
    if (setting === 'voice') this.audio.setVoiceEnabled(settings.voice);
    this.ui.applySettings();
    this.ui.renderModal();
    if (this.state.ui.phoneOpen) this.ui.renderPhone();
  }

  handleEscape() {
    if (this.state.ui.modal === 'intro') return;
    if (this.state.ui.modal === 'summary') {
      this.ui.closeModal();
      return;
    }
    if (this.state.ui.modal) {
      this.ui.closeModal();
      return;
    }
    if (this.state.ui.phoneOpen) {
      this.closePhone();
      return;
    }
    if (this.state.ui.activeDialogue) {
      this.ui.closeDecision();
      return;
    }
    if (this.state.ui.inspector) {
      this.closeInspector();
      return;
    }
    if (this.state.ui.activeDecision) {
      this.ui.showCaption('Elige una respuesta para continuar. El tiempo está en pausa.', 3000);
    }
  }
}
