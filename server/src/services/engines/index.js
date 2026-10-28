const BaseEngine = require('./baseEngine');
const CartesiaLineEngine = require('./cartesiaLineEngine');
const PipelineEngine = require('./pipelineEngine');

/**
 * Engine Adapter Factory
 *
 * Instantiates the appropriate conversation engine per AI employee:
 * - CartesiaLineEngine (Default when employee has cartesia_agent_id):
 *     Direct Calls API WebSocket bridge (wss://api.cartesia.ai/agents/stream/{agent_id})
 * - PipelineEngine (Fallback or explicit):
 *     VoBiz audio -> VAD -> Sarvam STT -> Groq LPU -> Cartesia TTS
 */
async function createEngine({ employee, lead, session, orgId, employeeKnowledge }) {
  const preferredEngine = String(employee?.calling_engine || employee?.engine || process.env.DEFAULT_ENGINE || 'pipeline').toLowerCase();
  const hasCartesiaAgent = Boolean(employee?.cartesia_agent_id);

  // 1. Only try CartesiaLineEngine if explicitly set to 'cartesia_line' and agent ID is present
  if (hasCartesiaAgent && preferredEngine === 'cartesia_line') {
    try {
      console.log(`[engine-adapter] Initializing CartesiaLineEngine for "${employee?.name}" (agent_id: ${employee.cartesia_agent_id})`);
      const lineEngine = new CartesiaLineEngine({ session, employee, lead, orgId });
      await lineEngine.start();
      console.log(`[engine-adapter] ✓ CartesiaLineEngine successfully active for call ${session.callId}`);
      return lineEngine;
    } catch (err) {
      console.warn(`[engine-adapter] CartesiaLineEngine startup failed (${err.message}). Falling back to PipelineEngine.`);
    }
  }

  // 2. Production telephony pipeline engine: VoBiz audio <-> VAD <-> STT <-> Groq LPU <-> Cartesia Sonic 3.6 TTS
  console.log(`[engine-adapter] Initializing PipelineEngine for "${employee?.name}" (call: ${session.callId})`);
  const pipelineEngine = new PipelineEngine({ session, employee, lead, orgId, employeeKnowledge: employeeKnowledge || session?.employeeKnowledge });
  await pipelineEngine.start();
  return pipelineEngine;
}

module.exports = {
  BaseEngine,
  CartesiaLineEngine,
  PipelineEngine,
  createEngine,
};
