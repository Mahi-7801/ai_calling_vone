const config = require('../config/env');
const { queryOne, update } = require('../config/db');

const API_BASE = 'https://api.cartesia.ai';
const API_VERSION = '2026-08-14';

/**
 * Creates a valid Cartesia agent name slug matching /^[a-z0-9_\-.]+$/
 */
function toCartesiaSlug(name, id) {
  const clean = String(name || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
  const suffix = id ? String(id) : Math.random().toString(36).slice(2, 7);
  return `agent-${clean || 'sales'}-${suffix}`;
}

/**
 * Map employee language to Cartesia language code
 */
function resolveCartesiaLanguage(lang, code) {
  if (code && typeof code === 'string') {
    return code.split('-')[0].toLowerCase();
  }
  const l = String(lang || 'Telugu').toLowerCase();
  if (l.includes('telugu')) return 'te';
  if (l.includes('hindi')) return 'hi';
  if (l.includes('tamil')) return 'ta';
  if (l.includes('kannada')) return 'kn';
  if (l.includes('malayalam')) return 'ml';
  if (l.includes('marathi')) return 'mr';
  return 'en';
}

/**
 * Sync AI Employee to Cartesia Agents API (play.cartesia.ai/agents)
 *
 * @param {Object} employee - The AI employee object from DB or build request
 * @returns {Promise<{ success: boolean, agentId: string, agentUrl: string } | null>}
 */
async function syncCartesiaAgent(employee) {
  const apiKey = config.providers.cartesia.apiKey;
  if (!apiKey) {
    console.warn('[cartesia-agent] Cartesia API key not configured; skipping agent sync.');
    return null;
  }

  const voiceId = String(employee.voice || '82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b').replace(/^cartesia:/, '');
  const langCode = resolveCartesiaLanguage(employee.language, employee.language_code);
  const instructions = String(employee.instructions || employee.system_prompt || '').trim();
  const greeting = String(employee.greeting || employee.welcome_message || '').trim();
  let agentId = employee.cartesia_agent_id;

  if (!agentId && employee.id) {
    const row = await queryOne('SELECT cartesia_agent_id FROM ai_employees WHERE id = ?', [employee.id]).catch(() => null);
    if (row?.cartesia_agent_id) {
      agentId = row.cartesia_agent_id;
    }
  }

  try {
    // 1. If we already have a Cartesia Agent ID, try updating it
    if (agentId) {
      console.log(`[cartesia-agent] Updating existing Cartesia agent ${agentId} ...`);
      const patchRes = await fetch(`${API_BASE}/agents/${agentId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Cartesia-Version': API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: toCartesiaSlug(employee.name, employee.id),
          tts_voice: voiceId,
          tts_model: 'sonic-3.6',
          tts_language: langCode,
          llm_system_prompt: instructions,
          llm_introduce: greeting || null,
        }),
      });

      if (patchRes.ok) {
        const updated = await patchRes.json();
        console.log(`[cartesia-agent] ✓ Cartesia agent ${agentId} updated successfully.`);
        return {
          success: true,
          agentId,
          agentUrl: `https://play.cartesia.ai/agents/${agentId}`,
          data: updated,
        };
      }

      if (patchRes.status !== 404) {
        const errText = await patchRes.text().catch(() => '');
        console.warn(`[cartesia-agent] PATCH failed (${patchRes.status}):`, errText);
      }
      // If 404, the agent was deleted on play.cartesia.ai, so recreate it below
    }

    // 2. Create new Cartesia Agent
    const slugName = toCartesiaSlug(employee.name, employee.id);
    console.log(`[cartesia-agent] Creating new Cartesia agent "${slugName}" ...`);

    const createRes = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: slugName,
        description: String(employee.role || employee.name || 'AI Sales Representative').slice(0, 100),
        model: {
          provider: 'openai',
          name: 'gpt-4o-mini',
        },
        voice: {
          mode: 'id',
          id: voiceId,
        },
      }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      agentId = created.id;
      console.log(`[cartesia-agent] ✓ Created Cartesia agent ${agentId}`);

      // 3. Immediately PATCH instructions, greeting, model, and language
      await fetch(`${API_BASE}/agents/${agentId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Cartesia-Version': API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tts_voice: voiceId,
          tts_model: 'sonic-3.6',
          tts_language: langCode,
          llm_system_prompt: instructions,
          llm_introduce: greeting || null,
        }),
      }).catch((err) => console.warn('[cartesia-agent] initial PATCH failed:', err.message));

      // 4. Save cartesia_agent_id to MySQL if employee has an ID
      if (employee.id) {
        await update('UPDATE ai_employees SET cartesia_agent_id = ? WHERE id = ?', [agentId, employee.id]).catch(() => {});
      }

      return {
        success: true,
        agentId,
        agentUrl: `https://play.cartesia.ai/agents/${agentId}`,
      };
    }

    // 3. Handle quota limit (402 Agent limit reached)
    // If account has reached agent quota (e.g. 1 agent allowed on free/starter plan),
    // fetch existing agent list from Cartesia and adopt/sync that agent slot for this employee!
    const errText = await createRes.text().catch(() => '');
    if (createRes.status === 402 || errText.includes('quota_exceeded') || errText.includes('Agent limit reached')) {
      console.log('[cartesia-agent] Cartesia agent plan quota reached (1 agent max). Re-using active Cartesia agent slot...');
      const listRes = await fetch(`${API_BASE}/agents`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Cartesia-Version': API_VERSION,
        },
      });

      if (listRes.ok) {
        const listData = await listRes.json();
        const existing = listData?.summaries?.[0];
        if (existing?.id) {
          agentId = existing.id;
          console.log(`[cartesia-agent] Syncing employee "${employee.name}" to Cartesia agent slot ${agentId} ...`);

          const patchRes = await fetch(`${API_BASE}/agents/${agentId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Cartesia-Version': API_VERSION,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: toCartesiaSlug(employee.name, employee.id),
              tts_voice: voiceId,
              tts_model: 'sonic-3.6',
              tts_language: langCode,
              llm_system_prompt: instructions,
              llm_introduce: greeting || null,
            }),
          });

          if (patchRes.ok) {
            console.log(`[cartesia-agent] ✓ Adopted and updated Cartesia agent ${agentId} for employee "${employee.name}"`);
            if (employee.id) {
              await update('UPDATE ai_employees SET cartesia_agent_id = ? WHERE id = ?', [agentId, employee.id]).catch(() => {});
            }
            return {
              success: true,
              agentId,
              agentUrl: `https://play.cartesia.ai/agents/${agentId}`,
              adopted: true,
            };
          }
        }
      }
    }

    console.warn(`[cartesia-agent] POST /agents failed (${createRes.status}):`, errText);
    return null;
  } catch (err) {
    console.warn('[cartesia-agent] Error during Cartesia agent sync:', err.message);
    return null;
  }
}

/**
 * Delete an agent from Cartesia
 */
async function deleteCartesiaAgent(agentId) {
  const apiKey = config.providers.cartesia.apiKey;
  if (!apiKey || !agentId) return false;

  try {
    const res = await fetch(`${API_BASE}/agents/${agentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Cartesia-Version': API_VERSION,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  syncCartesiaAgent,
  deleteCartesiaAgent,
};
