const { AppError } = require('../../utils/errors');

const MOCK_RESPONSES = [
  'సరిగ్గా అర్థం చేసుకున్నాను. మీకోసం మేము ఉత్తమ సేవ అందిస్తాము.',
  'మంచి అంశం. మీ వ్యాపారానికి తగిన పరిష్కారం మా దగ్గర ఉంది.',
  'అలా అయితే రేపు మళ్లీ మాట్లాడుదాం, డెమో ఏర్పాటు చేస్తాం.',
  'మీ సమయానికి ధన్యవాదాలు. ఏవైనా ప్రశ్నలు ఉంటే అడగండి.',
];

class MockAIProvider {
  constructor() {
    this.index = 0;
  }

  async generateResponse(messages, _opts = {}) {
    if (!messages || !messages.length) throw new AppError('Messages required', 400, 'MESSAGES_REQUIRED');
    const userMsg = [...messages].reverse().find((m) => m.role === 'user');
    const text = userMsg?.content || '';
    // Slightly smarter mock: react to keywords
    let out = MOCK_RESPONSES[this.index++ % MOCK_RESPONSES.length];
    if (/ధర|price|cost/i.test(text)) {
      out = 'మా ధరలు వ్యాపార అవసరాలపై ఆధారపడతాయి. రేపు డెమోలో మీకు అన్ని వివరాలు చెప్తాం.';
    } else if (/ఆసక్తి|interested|demo/i.test(text)) {
      out = 'చాలా బాగుంది! రేపు మీ సౌకర్యవంతమైన సమయానికి డెమో ఏర్పాటు చేస్తాం.';
    } else if (/వద్దు|lేదు|no/i.test(text)) {
      out = 'సరే, అర్థం చేసుకున్నాను. ధన్యవాదాలు మరియు మీ దినం మంచిగా సాగాలి.';
    }
    return { text: out, usage: { prompt_tokens: 0, completion_tokens: 8 } };
  }

  // Emit the canned reply a few words at a time so the browser streaming path
  // is exercised identically in mock mode and against a real provider.
  async *streamResponse(messages, opts = {}) {
    const { text } = await this.generateResponse(messages, opts);
    const words = text.split(/(\s+)/);
    for (let i = 0; i < words.length; i += 3) {
      yield words.slice(i, i + 3).join('');
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  async analyzeCall(transcriptLines = [], _employee = null) {
    const joined = transcriptLines.map((l) => l.text || l).join(' ').toLowerCase();
    let outcome = 'follow_up';
    let sentiment = 'neutral';
    let intent = 'general_enquiry';
    let confidence = 0.7;

    if (/ధర|price|cost|కొనుగోలు/i.test(joined)) {
      outcome = 'interested';
      sentiment = 'positive';
      intent = 'pricing_enquiry';
      confidence = 0.9;
    } else if (/వద్దు|লేదు|no|నాకు అక్కర్లేదు/i.test(joined)) {
      outcome = 'not_interested';
      sentiment = 'negative';
      intent = 'rejection';
      confidence = 0.85;
    } else if (/రేపు|మళ్లీ|call.*back|పిలవండి/i.test(joined)) {
      outcome = 'callback';
      sentiment = 'neutral';
      intent = 'callback_requested';
      confidence = 0.8;
    } else if (/busy|బిజీ/i.test(joined)) {
      outcome = 'busy';
      sentiment = 'neutral';
      intent = 'busy';
      confidence = 0.8;
    }

    return {
      summary: 'AI ఉద్యోగి కస్టమర్తో మాట్లాడి వారి అవసరాలను తెలుసుకున్నారు. కస్టమర్ ఆసక్తి చూపించారు మరియు ఫాలో-అప్ కోసం అంగీకరించారు.',
      sentiment,
      intent,
      outcome,
      outcomeConfidence: confidence,
      outcomeReason: 'Conversation keywords matched classification.',
      nextAction: outcome === 'interested' ? 'Schedule demo call tomorrow.' : 'Add to follow-up queue.',
      quality: confidence > 0.8 ? 'high' : 'medium',
      objections: [],
    };
  }
}

module.exports = { MockAIProvider, MOCK_RESPONSES };