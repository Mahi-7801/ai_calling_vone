const EventEmitter = require('events');

/**
 * Base conversation engine interface.
 * Defines the contract for all call streaming engines (CartesiaLineEngine, PipelineEngine).
 */
class BaseEngine extends EventEmitter {
  constructor({ session, employee, lead, orgId }) {
    super();
    this.session = session;
    this.employee = employee;
    this.lead = lead;
    this.orgId = orgId;
    this.isClosed = false;
    this.name = 'base';
  }

  /**
   * Initialize and start the engine session (e.g. open WebSocket, send start frame, or send greeting).
   */
  async start() {
    throw new Error('start() must be implemented by engine');
  }

  /**
   * Handle incoming audio chunk from telephony carrier (8kHz mu-law Buffer).
   * @param {Buffer} chunk
   */
  handleInboundAudio(chunk) {
    throw new Error('handleInboundAudio() must be implemented by engine');
  }

  /**
   * Handle DTMF keypress from caller.
   * @param {string} digit
   */
  handleDtmf(digit) {}

  /**
   * Handle carrier confirmation that outbound playback finished.
   */
  onPlaybackConfirmed() {}

  /**
   * Handle carrier confirmation that outbound audio queue was cleared (e.g. after barge-in).
   */
  onPlaybackCleared() {}

  /**
   * Handle barge-in / interruption signal.
   */
  interrupt() {}

  /**
   * Clean up engine resources when call concludes.
   */
  async close() {
    this.isClosed = true;
  }
}

module.exports = BaseEngine;
