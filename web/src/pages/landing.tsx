import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  PhoneCall,
  PhoneIncoming,
  Sparkles,
  Zap,
  Shield,
  ArrowRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Globe,
  BarChart3,
  Clock,
  Check,
  ChevronDown,
  ChevronUp,
  Radio,
  Cpu,
  Flame,
  CheckCircle,
  CreditCard,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function LandingPage() {
  const { user, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<'real_estate' | 'bfsi' | 'healthcare' | 'ecommerce' | 'edtech'>('real_estate');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [callVolume, setCallVolume] = useState<number>(10000);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingAudio(true);
      }).catch((err) => {
        console.warn('Audio playback error:', err);
      });
    }
  };

  const toggleMuteAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !audioMuted;
    setAudioMuted(!audioMuted);
  };

  // ROI Calculations
  const humanCost = Math.round(callVolume * 15);
  const aiCost = Math.round(callVolume * 1.6);
  const savings = humanCost - aiCost;
  const savingsPct = Math.round((savings / humanCost) * 100);

  return (
    <div className="min-h-screen bg-white text-slate-800 selection:bg-indigo-500/20 selection:text-indigo-900 font-sans max-w-full overflow-x-hidden">
      {/* Hidden audio element for authentic Telugu greeting demo */}
      <audio
        ref={audioRef}
        src="/vone_telugu_greeting.mp3"
        onEnded={() => setIsPlayingAudio(false)}
        preload="metadata"
      />

      {/* Decorative ambient subtle light background glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-indigo-100/70 via-purple-100/60 to-cyan-100/50 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -left-32 w-[500px] h-[450px] bg-purple-100/50 blur-[130px] rounded-full" />
        <div className="absolute top-[75%] -right-32 w-[500px] h-[450px] bg-indigo-100/50 blur-[130px] rounded-full" />
      </div>

      {/* ============================================================ */}
      {/* STICKY NAVIGATION BAR (CLEAN WHITE THEME)                    */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group min-w-0 shrink-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-md shadow-indigo-600/20 group-hover:scale-105 transition-transform shrink-0">
              <Bot className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate">Telugu AI Calling</span>
                <span className="hidden sm:inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                  Live
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate leading-tight">by Vone Digitals</p>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-3.5 xl:gap-6 text-xs xl:text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors whitespace-nowrap py-1">Features</a>
            <a href="#live-demo" className="hover:text-indigo-600 transition-colors flex items-center gap-1.5 whitespace-nowrap py-1">
              Live Demo
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </a>
            <a href="#telephony" className="hover:text-indigo-600 transition-colors whitespace-nowrap py-1">Telephony</a>
            <a href="#use-cases" className="hover:text-indigo-600 transition-colors whitespace-nowrap py-1">Use Cases</a>
            <a href="#roi" className="hover:text-indigo-600 transition-colors whitespace-nowrap py-1">ROI Calculator</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors whitespace-nowrap py-1">Pricing</a>
            <a href="#faq" className="hover:text-indigo-600 transition-colors whitespace-nowrap py-1">FAQ</a>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-2 sm:gap-2.5 shrink-0">
            {isAuthenticated ? (
              <Link
                to={user?.role === 'admin' ? '/admin' : '/dashboard'}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02]"
              >
                <span>{user?.role === 'admin' ? 'Open Admin Portal' : 'Open Workspace'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all hover:scale-[1.02]"
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-5 space-y-3 shadow-lg">
            <nav className="flex flex-col space-y-2 text-sm font-medium text-slate-700">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">Features</a>
              <a href="#live-demo" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">Live Voice Demo</a>
              <a href="#telephony" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">Telephony & Carriers</a>
              <a href="#use-cases" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">Use Cases</a>
              <a href="#roi" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">ROI Calculator</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">Pricing Plans</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="px-2 py-1.5 hover:text-indigo-600">FAQ</a>
            </nav>
            <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
              {isAuthenticated ? (
                <Link
                  to={user?.role === 'admin' ? '/admin' : '/dashboard'}
                  className="w-full text-center py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-xs shadow-sm"
                >
                  Open {user?.role === 'admin' ? 'Admin Portal' : 'Workspace'}
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="w-full text-center py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-semibold text-xs"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/register"
                    className="w-full text-center py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-xs shadow-sm"
                  >
                    Start Free Trial
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ============================================================ */}
      {/* HERO SECTION (LIGHT WHITE THEME)                             */}
      {/* ============================================================ */}
      <section className="relative z-10 pt-10 pb-16 md:pt-16 md:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left Column: Hero Copy */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left min-w-0">
            {/* Announcement Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <span>Next-Gen Voice AI · Ultra-Low Latency Engine</span>
              <span className="text-indigo-300">|</span>
              <span className="text-emerald-700 font-bold">&lt; 200ms Latency</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
              Hire AI Calling Agents That Speak <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 bg-clip-text text-transparent">
                Human Telugu.
              </span>
            </h1>

            {/* Subheading */}
            <p className="max-w-2xl mx-auto lg:mx-0 text-sm sm:text-base lg:text-lg text-slate-600 leading-relaxed">
              Scale your outbound sales telecalling and handle 24/7 inbound customer support with autonomous conversational voice agents. Zero robotic pauses, authentic regional Telugu accents, and instant virtual phone numbers.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
              <Link
                to="/register"
                id="hero-cta-register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition-all hover:scale-[1.02]"
              >
                <span>Deploy Your First AI Agent</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <button
                id="hero-play-sample-btn"
                onClick={togglePlayAudio}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold text-sm hover:bg-slate-50 shadow-xs transition-all"
              >
                {isPlayingAudio ? (
                  <>
                    <Pause className="h-4 w-4 text-emerald-600" />
                    <span>Pause Live Audio</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 text-indigo-600 fill-indigo-600" />
                    <span>Listen to Telugu Sample</span>
                  </>
                )}
              </button>
            </div>

            {/* Trust Checklist */}
            <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-5 text-xs text-slate-600 font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero credit card required</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Instant +91 &amp; Global Numbers</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Full-duplex barge-in</span>
              </div>
            </div>

            {/* Metric Highlights */}
            <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-200">
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">&lt; 200ms</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">Voice Latency</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">99.4%</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">Regional Accent Match</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">100k+</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">Concurrent Outbound</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600">88%</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">Cost Savings vs BPO</div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Call Simulator (Clean White Card) */}
          <div className="lg:col-span-5 min-w-0" id="live-demo">
            <div className="relative rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-xl shadow-slate-200/70">
              {/* Top Call Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
                      <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-white">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                      <span>Swathi · Telugu Agent</span>
                      <span className="rounded bg-indigo-50 text-indigo-700 text-[10px] px-1.5 py-0.2 font-semibold">Outbound</span>
                    </h3>
                    <p className="text-[11px] sm:text-xs text-emerald-600 font-semibold flex items-center gap-1 truncate">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Live Connected · +91 63014 00137
                    </p>
                  </div>
                </div>

                {/* Audio Control */}
                <button
                  onClick={toggleMuteAudio}
                  className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
                  title={audioMuted ? "Unmute" : "Mute"}
                >
                  {audioMuted ? <VolumeX className="h-4 w-4 text-rose-500" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>

              {/* Dynamic Waveform Visualizer */}
              <div className="my-3 sm:my-4 rounded-xl bg-slate-50 border border-slate-200/80 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-700 min-w-0">
                  <button
                    onClick={togglePlayAudio}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm shadow-indigo-600/30 shrink-0"
                  >
                    {isPlayingAudio ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-white ml-0.5" />}
                  </button>
                  <span className="font-medium text-[11px] text-slate-600 truncate">
                    {isPlayingAudio ? "Speaking: High-Definition Neural Voice" : "Click to Hear Audio"}
                  </span>
                </div>

                {/* Animated Audio Bars */}
                <div className="flex items-center gap-1 h-5 shrink-0">
                  {[22, 14, 20, 10, 24, 16, 22, 12, 18, 20, 15, 18].map((h, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full bg-indigo-600 transition-all duration-200 ${
                        isPlayingAudio ? 'animate-pulse' : 'opacity-30'
                      }`}
                      style={{
                        height: isPlayingAudio ? `${Math.max(5, (h * (i % 3 + 1)) % 22)}px` : '5px',
                        animationDelay: `${i * 80}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Real-time Call Transcript */}
              <div className="space-y-3 text-xs max-h-[260px] overflow-y-auto pr-1">
                {/* Agent Bubble */}
                <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-indigo-900">Swathi (AI Assistant)</span>
                    <span className="text-slate-400">00:04</span>
                  </div>
                  <p className="text-slate-800 font-medium">
                    "నమస్తే అండి! Vone Digitals నుండి స్వాతిని మాట్లాడుతున్నాను. మీరు నిన్న మా గేటెడ్ కమ్యూనిటీ విల్లాస్ బ్రోచర్ డౌన్‌లోడ్ చేశారు కదా, రేపు సైట్ విజిట్ కోసం సమయం వీలవుతుందా?"
                  </p>
                  <p className="text-[11px] text-slate-500 italic">
                    (Namaste sir! Calling from Vone Digitals. You downloaded our villa brochure yesterday, would you be free for a site visit tomorrow?)
                  </p>
                </div>

                {/* Customer Bubble */}
                <div className="rounded-xl bg-slate-100/80 border border-slate-200/80 p-3 space-y-1 ml-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800">Customer (Mahesh)</span>
                    <span className="text-slate-400">00:14</span>
                  </div>
                  <p className="text-slate-800 font-medium">
                    "అవునండి! ఈ శనివారం ఉదయం 11 గంటలకు వీలవుతుంది. బ్యాంక్ లోన్ మరియు 3BHK ధర వివరాలు ఎలా ఉన్నాయి?"
                  </p>
                  <p className="text-[11px] text-slate-500 italic">
                    (Yes! This Saturday 11 AM works for me. What are the 3BHK prices and loan options?)
                  </p>
                </div>

                {/* Agent Bubble 2 */}
                <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-indigo-900">Swathi (AI Assistant)</span>
                    <span className="text-slate-400">00:22</span>
                  </div>
                  <p className="text-slate-800 font-medium">
                    "ఖచ్చితంగా అండి! 3BHK విల్లాస్ ₹85 లక్షల నుండి ప్రారంభమవుతున్నాయి. ప్రముఖ బ్యాంకులతో 8.35% వడ్డీతో 80% వరకు లోన్ సదుపాయం ఉంది. శనివారం 11:00 AM కి మీ విజిట్ బుక్ చేశాను, లొకేషన్ డీటెయిల్స్ వాట్సాప్‌లో పంపించాను!"
                  </p>
                </div>
              </div>

              {/* Bottom Real-time Insights Card */}
              <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                  <Flame className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Lead Intent: High Buyer (96%)</span>
                </div>
                <div className="flex items-center gap-1.5 text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                  <Clock className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Site Visit: Sat 11:00 AM</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* TELEPHONY & INFRASTRUCTURE STRIP (LIGHT WHITE THEME)          */}
      {/* ============================================================ */}
      <section className="relative z-10 border-y border-slate-200/80 bg-slate-50/70 py-10" id="telephony">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-6">
            Engineered on Carrier-Grade Telecom &amp; Sub-200ms Voice LPU Infrastructure
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6 items-center">
            {/* Enterprise Carrier */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all text-center">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Radio className="h-4 w-4 text-emerald-600" />
                Enterprise Carrier
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Direct Indian DID &amp; SIP</p>
            </div>

            {/* Voice Engine */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all text-center">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Neural Voice Engine
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Sub-100ms Ultra-HD Audio</p>
            </div>

            {/* Groq */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all text-center">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Cpu className="h-4 w-4 text-amber-600" />
                Groq LPU Engine
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Instant Interruption AI</p>
            </div>

            {/* Twilio */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all text-center">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Globe className="h-4 w-4 text-rose-600" />
                Twilio Global PSTN
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">100+ Countries Calling</p>
            </div>

            {/* Razorpay */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all text-center col-span-2 md:col-span-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <CreditCard className="h-4 w-4 text-cyan-600" />
                Razorpay Live
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Instant Number Purchases</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* CORE PLATFORM FEATURES (LIGHT WHITE THEME)                   */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" id="features">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
            Unrivaled Voice Intelligence
          </h2>
          <p className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Everything You Need to Replace Outdated Call Centers
          </p>
          <p className="text-slate-600 text-sm sm:text-base">
            Autonomous Telugu and multilingual voice agents that behave, listen, and negotiate like your top-performing human telecallers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-indigo-300 hover:shadow-xl transition-all group">
            <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
              <PhoneCall className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Mass Outbound Campaigns</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Upload CSV files with 10,000+ lead contacts and trigger simultaneous outbound dials. AI employees qualify leads, book appointments, and sync results in real-time.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-purple-300 hover:shadow-xl transition-all group">
            <div className="h-12 w-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
              <PhoneIncoming className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">24/7 Inbound Receptionist</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Never drop an inbound customer call after business hours. Intelligent IVR, real-time knowledge base retrieval, and warm human transfer for high-priority inquiries.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-cyan-300 hover:shadow-xl transition-all group">
            <div className="h-12 w-12 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 mb-4 group-hover:scale-110 transition-transform">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Zero-Latency Barge-In</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Powered by LiveKit WebRTC full-duplex audio. Customers can interrupt the agent naturally at any millisecond, and the AI halts immediately just like a human.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-xl transition-all group">
            <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Voice Cloning &amp; Dialects</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Clone your founder or sales champion's voice with a 60-second audio sample. Customize accents for Telangana, Coastal Andhra, and Rayalaseema.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-xl transition-all group">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Sentiment &amp; Transcripts</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Get word-for-word Telugu and English transcripts, sentiment scoring, call duration metrics, and audio recordings automatically pushed to your CRM.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-rose-300 hover:shadow-xl transition-all group">
            <div className="h-12 w-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 group-hover:scale-110 transition-transform">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">Enterprise Virtual Lines</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Acquire dedicated local or toll-free numbers via our live Razorpay gateway and enterprise carrier lines. Full telecom DND compliance and high answer rates.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* HOW IT WORKS (3 STEPS - LIGHT WHITE THEME)                   */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200/80" id="how-it-works">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
            Simple 3-Step Setup
          </h2>
          <p className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Go Live with Your First AI Employee in 5 Minutes
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <div className="relative p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-base shadow-sm">
              1
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Create Your AI Employee</h3>
            <p className="text-sm text-slate-600">
              Select language (Telugu, Hindi, English), assign a persona, upload product FAQs, and choose from our pre-cloned human voices.
            </p>
          </div>

          <div className="relative p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white font-bold text-base shadow-sm">
              2
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Attach Virtual Phone Number</h3>
            <p className="text-sm text-slate-600">
              Purchase dedicated local Indian (+91) or international numbers directly through our automated Razorpay carrier checkout.
            </p>
          </div>

          <div className="relative p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-base shadow-sm">
              3
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Launch &amp; Watch Leads Convert</h3>
            <p className="text-sm text-slate-600">
              Trigger outbound calling lists or route inbound phone calls. Monitor real-time transcripts, sentiment scores, and booked appointments.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* INDUSTRY USE CASES (TABBED SWITCHER - LIGHT WHITE THEME)     */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200/80" id="use-cases">
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
            Tailored Industry Solutions
          </h2>
          <p className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Built for High-Growth Indian Businesses
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { id: 'real_estate', label: 'Real Estate & Villas' },
            { id: 'bfsi', label: 'BFSI & Loan Recovery' },
            { id: 'healthcare', label: 'Hospitals & Clinics' },
            { id: 'ecommerce', label: 'E-Commerce & COD' },
            { id: 'edtech', label: 'EdTech & Admissions' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveUseCase(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeUseCase === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Cards */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
          {activeUseCase === 'real_estate' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div className="space-y-4">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Real Estate &amp; Construction</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Qualify 5,000+ Inquiries &amp; Book Weekend Site Visits Instantly
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Call inquiries within 60 seconds of Facebook or Google ad submission. The AI answers queries about pricing, square footage, amenities, and secures a confirmed site visit slot.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-emerald-600">3.4x</div>
                    <div className="text-xs text-slate-500 font-medium">Higher Site Visit Turnout</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-indigo-600">&lt; 45 Sec</div>
                    <div className="text-xs text-slate-500 font-medium">Lead Response Speed</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 text-slate-700">
                <div className="text-indigo-600 font-semibold">// Real Estate Conversation Sample</div>
                <p><span className="text-indigo-700 font-bold">AI Agent:</span> "నమస్తే! ఫార్చ్యూన్ విల్లాస్ నుండి మాట్లాడుతున్నాము. మీరు సైట్ ప్లాన్ చూశారా అండి?"</p>
                <p><span className="text-slate-600 font-bold">Lead:</span> "అవును, ఈ ఆదివారం కల్లా చూడడానికి వీలవుతుందా?"</p>
                <p><span className="text-indigo-700 font-bold">AI Agent:</span> "ఖచ్చితంగా అండి! ఆదివారం ఉదయం 11:30 AM కి స్లాట్ బుక్ చేశాను. మీ లొకేషన్ వివరాలు వాట్సాప్‌లో పంపాను."</p>
              </div>
            </div>
          )}

          {activeUseCase === 'bfsi' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div className="space-y-4">
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">BFSI &amp; Fintech</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Polite, Compliant EMI Reminders &amp; Overdue Recovery
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Empathetic yet persuasive multilingual calls reminding borrowers of upcoming payment due dates, offering UPI payment links, and recording repayment commitments.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-emerald-600">78%</div>
                    <div className="text-xs text-slate-500 font-medium">On-Time Repayment Rate</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-purple-600">100%</div>
                    <div className="text-xs text-slate-500 font-medium">RBI Compliance Adherence</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 text-slate-700">
                <div className="text-purple-600 font-semibold">// EMI Reminder Conversation Sample</div>
                <p><span className="text-purple-700 font-bold">AI Agent:</span> "నమస్తే రమేష్ గారు! మీ లోన్ EMI రేపటితో డ్యూ అవుతుంది. UPI లింక్ ద్వారా ఇప్పుడే చెల్లిస్తారా?"</p>
                <p><span className="text-slate-600 font-bold">Borrower:</span> "ఈరోజు సాయంత్రం 6 గంటలకు పే చేస్తానండి."</p>
                <p><span className="text-purple-700 font-bold">AI Agent:</span> "సరే అండి! మీ రిజిస్టర్డ్ మొబైల్‌కి పేమెంట్ లింక్ పంపాను. ధన్యవాదాలు!"</p>
              </div>
            </div>
          )}

          {activeUseCase === 'healthcare' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div className="space-y-4">
                <span className="text-xs font-bold text-cyan-700 uppercase tracking-wider">Hospitals &amp; Clinics</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Automate Doctor Consultations &amp; Health Check Reminders
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Confirm patient appointments, reduce no-shows with polite Telugu calls, inform prep instructions for diagnostic tests, and gather post-treatment recovery feedback.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-emerald-600">91%</div>
                    <div className="text-xs text-slate-500 font-medium">Appointment Confirmation</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-cyan-700">-65%</div>
                    <div className="text-xs text-slate-500 font-medium">Clinic No-Show Reduction</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 text-slate-700">
                <div className="text-cyan-700 font-semibold">// Hospital Appointment Confirmation</div>
                <p><span className="text-cyan-800 font-bold">AI Agent:</span> "నమస్తే అండి! కిమ్స్ హాస్పిటల్ నుండి మాట్లాడుతున్నాను. డాక్టర్ సూర్యారావు గారితో మీ అపాయింట్‌మెంట్ రేపు 10:00 AM కి ఉంది, ధృవీకరిస్తున్నారా?"</p>
                <p><span className="text-slate-600 font-bold">Patient:</span> "అవును, ఖచ్చితంగా వస్తాను."</p>
                <p><span className="text-cyan-800 font-bold">AI Agent:</span> "చాలా సంతోషం అండి! దయచేసి 15 నిమిషాల ముందే రిసెప్షన్‌కి చేరుకోండి."</p>
              </div>
            </div>
          )}

          {activeUseCase === 'ecommerce' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div className="space-y-4">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">E-Commerce &amp; D2C Brands</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Zero-RTO Cash-on-Delivery Address &amp; Order Confirmation
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Call COD buyers immediately after checkout. Confirm customer delivery address and pin code in Telugu, verify intent, and eliminate return-to-origin courier losses.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-emerald-600">-52%</div>
                    <div className="text-xs text-slate-500 font-medium">Drop in COD RTO Losses</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-amber-700">98.2%</div>
                    <div className="text-xs text-slate-500 font-medium">Address Accuracy Verified</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 text-slate-700">
                <div className="text-amber-700 font-semibold">// COD Order Confirmation</div>
                <p><span className="text-amber-800 font-bold">AI Agent:</span> "నమస్తే! మీరు ఆర్డర్ చేసిన డ్రెస్ కోసం మాట్లాడుతున్నాను. క్యాష్ ఆన్ డెలివరీ ఆర్డర్ కన్ఫర్మ్ చేయమంటారా?"</p>
                <p><span className="text-slate-600 font-bold">Customer:</span> "అవునండి, ఇంటి అడ్రస్ కరెక్టే ఉంది."</p>
                <p><span className="text-amber-800 font-bold">AI Agent:</span> "ధన్యవాదాలు! మీ ఆర్డర్ రేపు డిస్పాచ్ అవుతుంది."</p>
              </div>
            </div>
          )}

          {activeUseCase === 'edtech' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-center">
              <div className="space-y-4">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">EdTech &amp; Coaching Academies</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Follow Up With Students &amp; Parents for Demo Classes
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Reach out to parents who filled inquiry forms for IIT, NEET, or coding courses. Answer syllabus queries, explain fee concessions, and book free live demo sessions.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-emerald-600">4.2x</div>
                    <div className="text-xs text-slate-500 font-medium">Demo Class Attendance</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xl font-bold text-indigo-600">₹0</div>
                    <div className="text-xs text-slate-500 font-medium">Telecaller Hiring Overhead</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-xs space-y-2 text-slate-700">
                <div className="text-indigo-600 font-semibold">// EdTech Demo Class Booking</div>
                <p><span className="text-indigo-700 font-bold">AI Agent:</span> "నమస్తే అండి! మీ అబ్బాయి నీట్ (NEET) కోచింగ్ డెమో క్లాస్ కోసం శనివారం 5 PM కి జూమ్ లింక్ షెడ్యూల్ చేయమంటారా?"</p>
                <p><span className="text-slate-600 font-bold">Parent:</span> "అవునండి, లింక్ నా వాట్సాప్‌కి పంపండి."</p>
                <p><span className="text-indigo-700 font-bold">AI Agent:</span> "తప్పకుండా! మీ మొబైల్‌కి కన్ఫర్మేషన్ మెసేజ్ పంపించాము."</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* INTERACTIVE ROI CALCULATOR (LIGHT WHITE THEME)               */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-slate-200/80" id="roi">
        <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-white via-indigo-50/20 to-purple-50/20 p-6 sm:p-12 shadow-lg">
          <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Instant ROI Calculator</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              See How Much You Save Every Month
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Slide to your expected monthly call volume to compare against traditional telecaller salaries and overheads.
            </p>
          </div>

          {/* Slider */}
          <div className="max-w-xl mx-auto space-y-3 mb-8">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
              <span className="text-slate-700">Monthly Calls Volume:</span>
              <span className="text-indigo-600 text-base sm:text-lg font-bold">{callVolume.toLocaleString()} calls</span>
            </div>
            <input
              type="range"
              min="2000"
              max="100000"
              step="2000"
              value={callVolume}
              onChange={(e) => setCallVolume(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[11px] text-slate-400 font-medium">
              <span>2,000</span>
              <span>25,000</span>
              <span>50,000</span>
              <span>100,000</span>
            </div>
          </div>

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-rose-200/80 shadow-xs">
              <div className="text-xs text-slate-500 font-medium mb-1">Human BPO / Telecallers</div>
              <div className="text-xl sm:text-2xl font-bold text-rose-600">₹{humanCost.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 mt-1">Salaries, office, turnover</div>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-white border border-indigo-200 shadow-xs">
              <div className="text-xs text-indigo-600 font-medium mb-1">Telugu AI Platform</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">₹{aiCost.toLocaleString()}</div>
              <div className="text-[11px] text-slate-500 mt-1">Carrier + AI model minutes</div>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 shadow-xs">
              <div className="text-xs text-emerald-700 font-medium mb-1">Your Monthly Savings</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600">₹{savings.toLocaleString()}</div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-1">Save {savingsPct}% every month</div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/20 hover:scale-105 transition-all"
            >
              <span>Unlock These Savings Now</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* TRANSPARENT PRICING SECTION (LIGHT WHITE THEME)              */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-200/80" id="pricing">
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
            Transparent Pricing
          </h2>
          <p className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Simple Plans with Live Razorpay Billing
          </p>
          <p className="text-slate-600 text-xs sm:text-sm">
            No hidden charges. Recharges and virtual number purchases happen in real-time.
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="pt-3 flex items-center justify-center gap-3">
            <span className={`text-xs font-semibold ${billingCycle === 'monthly' ? 'text-slate-900' : 'text-slate-500'}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
              className="relative w-12 h-6 rounded-full bg-slate-200 p-1 transition-colors border border-slate-300"
              aria-label="Toggle billing cycle"
            >
              <div
                className={`w-4 h-4 rounded-full bg-indigo-600 transition-transform ${
                  billingCycle === 'annual' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${billingCycle === 'annual' ? 'text-slate-900' : 'text-slate-500'}`}>Annual</span>
              <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5">
                Save 20%
              </span>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Starter Plan */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col justify-between hover:border-slate-300 hover:shadow-lg transition-all">
            <div className="space-y-4">
              <div className="text-sm font-bold text-slate-800">Starter Plan</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  ₹{billingCycle === 'monthly' ? '1,999' : '1,599'}
                </span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-600">
                Ideal for individual consultants and small businesses starting with voice AI.
              </p>

              <div className="pt-3 space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>1,000 AI Calling Minutes included</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>1 Dedicated Virtual Phone Number</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Telugu &amp; English Pre-Trained Voices</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Up to 3 Concurrent Dials</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Basic Call Transcripts &amp; Analytics</span>
                </div>
              </div>
            </div>

            <div className="pt-6 sm:pt-8">
              <Link
                to="/register"
                className="w-full block text-center py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-semibold text-xs hover:bg-slate-100 transition-colors"
              >
                Start Starter Trial
              </Link>
            </div>
          </div>

          {/* Growth / Business Plan (Featured) */}
          <div className="relative rounded-3xl border-2 border-indigo-600 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-indigo-100">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3.5 py-1 text-[11px] font-bold text-white shadow-md">
              MOST POPULAR · BEST VALUE
            </div>

            <div className="space-y-4 pt-1 sm:pt-2">
              <div className="text-sm font-bold text-indigo-700">Growth / Business</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  ₹{billingCycle === 'monthly' ? '4,999' : '3,999'}
                </span>
                <span className="text-xs text-slate-500">/ month</span>
              </div>
              <p className="text-xs text-slate-600">
                For sales teams, builders, and healthcare clinics scaling call volumes.
              </p>

              <div className="pt-3 space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-900">5,000 AI Calling Minutes included</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>3 Dedicated Virtual Phone Numbers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Custom Voice Cloning (Founder Voice)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Up to 15 Concurrent Dials</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>CRM Webhook Export &amp; Audio Recordings</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Real-time Lead Sentiment Scoring</span>
                </div>
              </div>
            </div>

            <div className="pt-6 sm:pt-8">
              <Link
                to="/register"
                className="w-full block text-center py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/25 hover:scale-[1.02] transition-transform"
              >
                Get Started with Growth
              </Link>
            </div>
          </div>

          {/* Enterprise Plan */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col justify-between hover:border-slate-300 hover:shadow-lg transition-all">
            <div className="space-y-4">
              <div className="text-sm font-bold text-slate-800">Enterprise</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">Custom</span>
              </div>
              <p className="text-xs text-slate-600">
                High-volume call centers, NBFCs, and retail chains requiring dedicated SIP trunks.
              </p>

              <div className="pt-3 space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>50,000+ AI Calling Minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Unlimited Virtual Phone Numbers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Dedicated Private SIP Trunks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Custom LLM Fine-Tuning</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>99.99% Uptime SLA &amp; 24/7 Support</span>
                </div>
              </div>
            </div>

            <div className="pt-6 sm:pt-8">
              <a
                href="mailto:contact@vonedigitals.com?subject=Enterprise%20Telugu%20AI%20Calling%20Inquiry"
                className="w-full block text-center py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-semibold text-xs hover:bg-slate-100 transition-colors"
              >
                Contact Enterprise Sales
              </a>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* PER-CALL PRICE BREAKDOWN & ZERO-CHARGE GUARANTEE             */}
        {/* ============================================================ */}
        <div className="mt-16 pt-12 border-t border-slate-200">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              Pay Only For Connected Conversations
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              How Much Does Each Call Actually Cost?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600">
              Clear, transparent per-call pricing with zero surprises. You are NEVER charged for unanswered or busy calls.
            </p>
          </div>

          {/* 4-Card Call Type Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10">
            {/* 1. Unanswered Call */}
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-5 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                    No Pick-Up
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold">0 seconds</span>
                </div>
                <div className="text-3xl font-extrabold text-emerald-700 mb-1">
                  ₹0.00
                </div>
                <div className="text-xs font-bold text-slate-800 mb-2">
                  Unanswered / Busy / Switched Off
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  If the customer doesn&apos;t answer, disconnects before pickup, or the number is invalid, you pay absolutely nothing.
                </p>
              </div>
              <div className="pt-4 border-t border-emerald-200/60 mt-4 text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>100% Zero-Charge Guarantee</span>
              </div>
            </div>

            {/* 2. Quick Call (~30s) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    Quick Touch
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">~30 seconds</span>
                </div>
                <div className="text-3xl font-extrabold text-slate-900 mb-1">
                  ₹1.50
                </div>
                <div className="text-xs font-bold text-slate-800 mb-2">
                  Wrong Number / Reschedule
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Customer answers and says &quot;Not interested right now&quot;, &quot;Call me tomorrow&quot;, or short status verification.
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 mt-4 text-[11px] text-slate-600 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span>Status &amp; transcript logged</span>
              </div>
            </div>

            {/* 3. Standard Call (~1m) */}
            <div className="relative rounded-2xl border-2 border-indigo-500 bg-indigo-50/30 p-5 flex flex-col justify-between shadow-md">
              <div className="absolute -top-2.5 right-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-0.5 shadow-xs">
                MOST COMMON
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                    Lead Qualification
                  </span>
                  <span className="text-[11px] text-indigo-700 font-semibold">~60 seconds</span>
                </div>
                <div className="text-3xl font-extrabold text-indigo-700 mb-1">
                  ₹3.00
                </div>
                <div className="text-xs font-bold text-slate-900 mb-2">
                  Full Pitch &amp; Qualification
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  AI greets in native Telugu, introduces your offer, asks 2-3 qualifying questions, and captures customer interest.
                </p>
              </div>
              <div className="pt-4 border-t border-indigo-200/60 mt-4 text-[11px] text-indigo-800 font-semibold flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span>Audio recording + CRM export</span>
              </div>
            </div>

            {/* 4. Full Sales / Booking (~2m) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                    Deep Sales / Booking
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">~120 seconds</span>
                </div>
                <div className="text-3xl font-extrabold text-slate-900 mb-1">
                  ₹6.00
                </div>
                <div className="text-xs font-bold text-slate-800 mb-2">
                  Appointment Scheduled
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Detailed conversation answering customer queries, handling price objections, and booking appointment slots.
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 mt-4 text-[11px] text-slate-600 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                <span>Full booking details captured</span>
              </div>
            </div>
          </div>

          {/* 1,000 Leads Real Campaign Case Study Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-7 space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-semibold text-indigo-300">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Real Campaign Unit Economics</span>
                </div>
                <h4 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  What Does a 1,000-Lead Campaign Cost?
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  When you upload 1,000 customer phone numbers, here is what your actual bill looks like:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="text-slate-400 text-[11px]">400 Unanswered Calls</div>
                    <div className="text-lg font-bold text-emerald-400">₹0.00</div>
                    <div className="text-[10px] text-slate-500">100% Free</div>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="text-slate-400 text-[11px]">350 Quick Touches</div>
                    <div className="text-lg font-bold text-white">~₹525</div>
                    <div className="text-[10px] text-slate-400">@ ~₹1.50 each</div>
                  </div>
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <div className="text-slate-400 text-[11px]">250 Full Conversations</div>
                    <div className="text-lg font-bold text-indigo-300">~₹1,125</div>
                    <div className="text-[10px] text-indigo-200">@ ~₹4.50 avg</div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white/10 backdrop-blur-md rounded-xl border border-white/15 p-5 text-center space-y-3">
                <div className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
                  Total Investment for 1,000 Leads
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400">
                  ~₹1,650 Total
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Completed in <strong className="text-white">15 minutes</strong> across parallel AI lines. Compare this to hiring a human telecaller (₹18,000/mo salary + 10 days of calling).
                </p>
                <Link
                  to="/register"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition-all hover:scale-[1.02]"
                >
                  <span>Launch 1,000 Leads Campaign</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FREQUENTLY ASKED QUESTIONS (LIGHT WHITE THEME)               */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-200/80" id="faq">
        <div className="text-center mb-12 space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-indigo-600 font-bold">
            Got Questions?
          </h2>
          <p className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Frequently Asked Questions
          </p>
        </div>

        <div className="space-y-3">
          {[
            {
              q: "How much does each call cost, and am I charged if the customer does not pick up?",
              a: "You are NEVER charged for unanswered, busy, or switched-off calls (₹0.00 cost). For connected conversations, pricing is based on talk-time at approximately ₹3.00 per minute. A quick 30-second call costs ~₹1.50, and a standard 1-minute lead qualification call costs ~₹3.00 with full Telugu STT, AI intelligence, voice synthesis, recording, and transcript included."
            },
            {
              q: "How natural does the Telugu voice sound? Does it have a robotic or foreign accent?",
              a: "Our Telugu voices are trained on native speakers from Telangana and Andhra Pradesh using advanced neural speech synthesis. They pronounce complex Telugu words, inflections, and conversational fillers naturally without any synthetic robotic or foreign accent."
            },
            {
              q: "Can callers interrupt the AI while it is talking?",
              a: "Yes! The platform utilizes full-duplex WebRTC streaming with sub-200ms Groq LPU inference. The moment a customer speaks, the AI immediately halts speech, analyzes the interruption, and responds seamlessly—just like a real human."
            },
            {
              q: "How do I purchase Indian (+91) phone numbers?",
              a: "You can purchase dedicated Indian (+91) and international virtual phone numbers directly inside your workspace via our integrated Razorpay payment gateway and enterprise carrier routing. Numbers are activated within seconds."
            },
            {
              q: "Can I connect this with my CRM like Salesforce, HubSpot, or LeadSquared?",
              a: "Absolutely. We provide live Webhook integration and REST APIs. Every completed call automatically pushes the audio recording, word-for-word Telugu/English transcript, intent tag, and sentiment score straight to your CRM."
            },
            {
              q: "What is the setup time to launch my first outbound campaign?",
              a: "Less than 5 minutes! Simply register an account, configure your agent's knowledge base, upload a CSV list of contacts, and hit Launch."
            },
          ].map((faq, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs transition-colors"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors"
              >
                <span>{faq.q}</span>
                {openFaq === idx ? (
                  <ChevronUp className="h-4 w-4 text-indigo-600 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                )}
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-4 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* FINAL HIGH-CONVERTING CTA BANNER                             */}
      {/* ============================================================ */}
      <section className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 p-8 sm:p-14 text-center shadow-xl text-white">
          <div className="relative z-10 max-w-3xl mx-auto space-y-5">
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
              Ready to Put Your Sales &amp; Support on Autopilot?
            </h2>
            <p className="text-sm sm:text-base lg:text-lg text-indigo-100 leading-relaxed">
              Join leading real estate builders, fintech lenders, and businesses scaling with Telugu AI Calling. Setup takes less than 5 minutes.
            </p>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/register"
                id="bottom-cta-register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-indigo-950 font-bold text-sm shadow-md hover:bg-slate-100 hover:scale-105 transition-all"
              >
                <span>Create Free Account</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/30 bg-white/10 text-white font-semibold text-sm hover:bg-white/20 backdrop-blur transition-all"
              >
                <span>Sign In to Portal</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FOOTER (CLEAN LIGHT THEME)                                   */}
      {/* ============================================================ */}
      <footer className="relative z-10 border-t border-slate-200 bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <span className="font-bold text-slate-900 text-sm">Telugu AI Calling</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Next-generation autonomous voice AI agents for Indian enterprises, powered by Vone Digitals.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] text-emerald-700 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Telephony &amp; AI Systems Operational</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">Product</h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li><a href="#features" className="hover:text-indigo-600 transition-colors">Instant Outbound Calling</a></li>
              <li><a href="#features" className="hover:text-indigo-600 transition-colors">24/7 Inbound Receptionist</a></li>
              <li><a href="#features" className="hover:text-indigo-600 transition-colors">Custom Voice Cloning</a></li>
              <li><a href="#telephony" className="hover:text-indigo-600 transition-colors">Virtual Phone Numbers</a></li>
              <li><a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing &amp; Plans</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">Solutions</h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li><a href="#use-cases" className="hover:text-indigo-600 transition-colors">Real Estate &amp; Villas</a></li>
              <li><a href="#use-cases" className="hover:text-indigo-600 transition-colors">BFSI &amp; Loan Recovery</a></li>
              <li><a href="#use-cases" className="hover:text-indigo-600 transition-colors">Hospitals &amp; Clinics</a></li>
              <li><a href="#use-cases" className="hover:text-indigo-600 transition-colors">E-Commerce COD Confirmation</a></li>
              <li><a href="#use-cases" className="hover:text-indigo-600 transition-colors">EdTech Admissions</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">Company &amp; Support</h4>
            <ul className="space-y-2 text-xs text-slate-600">
              <li><Link to="/login" className="hover:text-indigo-600 transition-colors">Customer Portal</Link></li>
              <li><Link to="/register" className="hover:text-indigo-600 transition-colors">Create Account</Link></li>
              <li><a href="mailto:contact@vonedigitals.com" className="hover:text-indigo-600 transition-colors">contact@vonedigitals.com</a></li>
              <li><span className="text-slate-400">Hyderabad &amp; Bengaluru, India</span></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <p>© {new Date().getFullYear()} Vone Digitals. All rights reserved.</p>
          <div className="flex gap-4 sm:gap-6">
            <span className="hover:text-slate-700 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-slate-700 cursor-pointer">Terms of Service</span>
            <span className="hover:text-slate-700 cursor-pointer">Security &amp; Compliance</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
