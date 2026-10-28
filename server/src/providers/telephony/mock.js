const { generateId } = require('../../utils/helpers');

const TELUGU_DIALOGUES = {
  greeting: [
    'హలో! నేను [NAME]. మీరు ఎలా ఉన్నారు?',
    'నమస్కారం! నేను [NAME] మాట్లాడుతున్నాను. మాట్లాడటానికి సౌకర్యంగా ఉందా?',
  ],
  customerResponses: [
    'అవును, చెప్పండి',
    'మీ సర్వీస్ గురించి మరింత తెలుసుకోవాలనుకుంటున్నాను',
    'ప్రస్తుతం బిజీగా ఉన్నాను, మళ్లీ పిలవండి',
    'లేదు, నాకు ఆసక్తి లేదు',
    'మీ ధరలు ఎలా ఉన్నాయి?',
    'సరే, రేపు మళ్లీ మాట్లాడదాం',
  ],
  aiLines: [
    'మా AI కాలింగ్ సర్వీస్ మీ వ్యాపారానికి సహాయపడుతుంది. కొంచెం వివరాలు చెప్తానా?',
    'నేను ఒక్క ప్రశ్న మాత్రమే అడుగుతాను. మీ వ్యాపారంలో ఎలాంటి సమస్య ఎదుర్కొంటున్నారు?',
    'మంచి ప్రశ్న! మీకు డెమో చూపించమంటే మేము ఏర్పాటు చేస్తాము.',
    'అర్థం చేసుకున్నాను. ఈ విషయంలో మేము ఖచ్చితంగా సహాయం చేస్తాము.',
    'మీ సమయం కోసం కృతజ్ఞతలు. త్వరలో మళ్లీ మీతో మాట్లాడతాం.',
  ],
  endings: {
    interested: ['చాలా బాగుంది! రేపు మళ్లీ మాట్లాడితే డెమో ఏర్పాటు చేస్తాం. ధన్యవాదాలు!'],
    notInterested: ['అర్థం చేసుకున్నాను, ధన్యవాదాలు. మీకు అవసరం వచ్చినప్పుడు మమ్మల్ని సంప్రదించండి. మీ దినం మంచిగా సాగాలి.'],
    followup: ['సరే! మీరు చెప్పిన సమయానికి మళ్లీ పిలుస్తాం. ధన్యవాదాలు!'],
  },
};

class MockTelephonyProvider {
  constructor() {
    this.active = new Map();
  }

  async makeCall({ to, from, employee, callId }) {
    const providerCallId = generateId('mocktel');
    const p = new Promise((resolve) => setTimeout(() => resolve('answered'), 2500));
    this.active.set(providerCallId, { callId, to, from, status: 'ringing', timer: null, promised: p });
    return { providerCallId, status: 'ringing' };
  }

  async hangupCall(providerCallId) {
    const entry = this.active.get(providerCallId);
    if (entry) {
      this.active.delete(providerCallId);
      return { status: 'hungup' };
    }
    return { status: 'unknown' };
  }

  async getCallStatus(providerCallId) {
    const entry = this.active.get(providerCallId);
    if (!entry) return { status: 'completed', duration: 0 };
    return { status: 'ringing', duration: 0 };
  }

  async listPhoneNumbers() {
    return [
      { number: '+919810000001', country: 'IN', type: 'local', status: 'active' },
      { number: '+919810000002', country: 'IN', type: 'tollfree', status: 'active' },
    ];
  }

  getDialogues() {
    return TELUGU_DIALOGUES;
  }
}

module.exports = { MockTelephonyProvider, TELUGU_DIALOGUES };