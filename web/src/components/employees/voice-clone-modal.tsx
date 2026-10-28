import { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Upload,
  Volume2,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Download,
  AlertCircle,
  VolumeX,
  FileAudio,
  Trash2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { fetchAudioObjectUrl, triggerAudioDownload, slugifyFileName } from '@/lib/audio';

interface VoiceCloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: number;
  onVoiceCloned: (voiceId: string, voiceName: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VoiceCloneModal({ open, onOpenChange, employeeId, onVoiceCloned }: VoiceCloneModalProps) {
  const toast = useToast();
  const [mode, setMode] = useState<'record' | 'upload'>('upload');
  const [voiceName, setVoiceName] = useState('');
  const [language, setLanguage] = useState<'te' | 'hi' | 'en'>('te');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Submission state
  const [isCloning, setIsCloning] = useState(false);
  const [clonedResult, setClonedResult] = useState<{ voice_id: string; name: string; sample_url: string | null } | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Telugu reading prompts
  const samplePrompts = {
    te: 'నమస్కారం! నేను వోన్ డిజిటల్స్ నుండి మాట్లాడుతున్నాను. మీ వ్యాపారానికి సరికొత్త AI సొల్యూషన్స్ మరియు వాట్సాప్ CRM ద్వారా మరింత మంది కస్టమర్లను ఎలా చేరుకోవచ్చో వివరించడానికి కాల్ చేశాను.',
    hi: 'नमस्ते! मैं वोन डिजिटल्स से बात कर रहा हूँ। आपके व्यवसाय को बढ़ाने के लिए हमारे नए AI वॉइस एजेंट्स और ऑटोमेशन सिस्टम के बारे में जानकारी देने के लिए मैंने कॉल किया है।',
    en: 'Hello! I am calling from Vone Digitals to share how our conversational AI platform and real-time voice agents can accelerate your customer engagement and automate sales.',
  };

  // Generate object URL for uploaded audio preview
  useEffect(() => {
    if (!selectedFile) {
      setUploadedAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setUploadedAudioUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudioBlob(audioBlob);
        setRecordedAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());

        // Suggest voice name if empty
        if (!voiceName.trim()) {
          setVoiceName(`My Echo Voice ${new Date().toLocaleDateString('en-IN')}`);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 45) {
            stopRecording();
            return 45;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast.error('Microphone access denied', 'Please enable microphone permissions in your browser.');
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleIncomingFile = (file: File) => {
    // Only reject files that are clearly non-audio documents/images/archives
    const isDisallowed =
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      /\.(png|jpg|jpeg|gif|webp|svg|pdf|txt|csv|xlsx|docx|zip|exe|tar|gz)$/i.test(file.name);

    if (isDisallowed) {
      toast.error(
        'Invalid file type',
        'Please upload an audio recording or voice note (e.g. .mp3, .wav, .m4a, .opus, .ogg, .mp4).'
      );
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large', 'Please upload a voice sample smaller than 50MB (10–60 seconds recommended).');
      return;
    }

    setSelectedFile(file);

    // Auto-fill voice profile name if currently empty
    if (!voiceName.trim()) {
      const autoName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (autoName) {
        setVoiceName(autoName);
      }
    }

    toast.success('Voice recording loaded', `${file.name} (${formatFileSize(file.size)})`);
  };

  const handleClone = async () => {
    let effectiveName = voiceName.trim();
    if (!effectiveName) {
      if (mode === 'upload' && selectedFile) {
        effectiveName = selectedFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      } else if (mode === 'record' && recordedAudioBlob) {
        effectiveName = `My Echo Voice ${new Date().toLocaleDateString('en-IN')}`;
      }
    }

    if (!effectiveName) {
      toast.error('Voice name required', 'Please provide a name for your cloned voice.');
      return;
    }

    let audioBlobToSend: Blob | null = null;
    const safeFileBase = effectiveName.replace(/\s+/g, '_') || 'voice';
    let fileName = `${safeFileBase}.wav`;

    if (mode === 'record') {
      if (!recordedAudioBlob || recordingSeconds < 1) {
        toast.error('Audio clip required', 'Please record at least 1-5 seconds of clear speech.');
        return;
      }
      audioBlobToSend = recordedAudioBlob;
      fileName = `${safeFileBase}.webm`;
    } else {
      if (!selectedFile) {
        toast.error('No audio file selected', 'Please upload or drop a .wav or .mp3 sample.');
        return;
      }
      audioBlobToSend = selectedFile;
      fileName = selectedFile.name;
    }

    setIsCloning(true);
    try {
      const formData = new FormData();
      formData.append('clip', audioBlobToSend, fileName);
      formData.append('name', effectiveName);
      formData.append('language', language);
      if (employeeId) formData.append('employeeId', String(employeeId));

      const res = await api.upload<{
        success: boolean;
        voice: { id: number; name: string; voice_id: string; sample_url: string | null; status?: string };
        message: string;
      }>('/employees/clone-voice', formData);

      setClonedResult(res.voice);
      toast.success('Voice cloned successfully!', 'Neural voice engine has generated your custom voice profile.');
      onVoiceCloned(res.voice.voice_id, res.voice.name);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Voice cloning could not be completed.';
      msg = msg.replace(/\b(sarvam|cartesia):\s*/gi, '').trim();
      toast.error('Voice cloning failed', msg);
    } finally {
      setIsCloning(false);
    }
  };

  const togglePreviewPlay = async () => {
    if (!clonedResult?.sample_url) return;
    if (isPlayingPreview) {
      previewAudioRef.current?.pause();
      setIsPlayingPreview(false);
      return;
    }
    try {
      if (!previewAudioRef.current) {
        const playable = await fetchAudioObjectUrl(clonedResult.sample_url);
        previewAudioRef.current = new Audio(playable);
        previewAudioRef.current.onended = () => setIsPlayingPreview(false);
        previewAudioRef.current.onerror = () => {
          setIsPlayingPreview(false);
          toast.error('Unable to play audio sample');
        };
      }
      await previewAudioRef.current.play();
      setIsPlayingPreview(true);
    } catch {
      setIsPlayingPreview(false);
      toast.error('Unable to play audio sample');
    }
  };

  const downloadSample = async () => {
    if (!clonedResult?.sample_url) return;
    let objectUrl: string | null = null;
    try {
      objectUrl = await fetchAudioObjectUrl(clonedResult.sample_url);
      triggerAudioDownload(objectUrl, `${slugifyFileName(clonedResult.name)}_sample.mp3`);
      toast.success('Sample downloaded', 'Your cloned voice sample has been saved.');
    } catch {
      toast.error('Download failed', 'Unable to save the voice sample.');
    } finally {
      if (objectUrl && objectUrl !== clonedResult.sample_url) {
        setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000);
      }
    }
  };

  const resetModal = () => {
    setRecordedAudioBlob(null);
    if (recordedAudioUrl) {
      try {
        URL.revokeObjectURL(recordedAudioUrl);
      } catch {
        /* ignore */
      }
    }
    setRecordedAudioUrl(null);
    setSelectedFile(null);
    if (uploadedAudioUrl) {
      try {
        URL.revokeObjectURL(uploadedAudioUrl);
      } catch {
        /* ignore */
      }
    }
    setUploadedAudioUrl(null);
    setClonedResult(null);
    setRecordingSeconds(0);
    setIsRecording(false);
    setIsDragging(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetModal();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="text-lg flex items-center gap-2">
                  Clone Your Personal Voice
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Provide 10 to 30 seconds of clean speech. Our neural voice engine synthesizes your exact vocal tone and accent.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center sm:flex-col sm:items-end gap-1.5 shrink-0 self-start sm:self-auto">
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-extrabold text-emerald-600">
                ₹10 / Clone
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">₹10.0/min on calls</span>
            </div>
          </div>
        </DialogHeader>

        {clonedResult ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-base text-foreground">{clonedResult.name}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Voice ID:{' '}
                  <span className="font-mono text-foreground font-semibold">{clonedResult.voice_id}</span>
                </p>
              </div>

              {clonedResult.sample_url && (
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={togglePreviewPlay}
                    className="gap-2 text-xs font-semibold"
                  >
                    {isPlayingPreview ? <VolumeX className="h-4 w-4 text-primary" /> : <Volume2 className="h-4 w-4 text-primary" />}
                    {isPlayingPreview ? 'Pause Cloned Voice' : 'Listen to Cloned Voice Sample'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadSample}
                    className="gap-2 text-xs font-semibold"
                  >
                    <Download className="h-4 w-4 text-primary" />
                    Download Sample
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5 border border-border">
              <div className="flex items-center justify-between text-foreground font-semibold">
                <span>Setup Fee Paid:</span>
                <span className="text-emerald-600 font-bold">₹10 (Deducted from wallet)</span>
              </div>
              <p>
                This cloned voice has been added to your voice library. Your AI employee will now speak with your personal voice on all live outbound and inbound calls (₹10.0/min)!
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                onClick={() => {
                  resetModal();
                  onOpenChange(false);
                }}
                className="w-full text-xs"
              >
                Done &amp; Save Voice
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Voice Name & Language Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="voice-name" className="text-xs">
                  Voice Profile Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="voice-name"
                  placeholder="e.g. Charan Native Telugu"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Primary Language</Label>
                <div className="flex gap-2">
                  {(
                    [
                      { id: 'te', label: 'Telugu (తెలుగు)' },
                      { id: 'hi', label: 'Hindi (हिन्दी)' },
                      { id: 'en', label: 'English' },
                    ] as const
                  ).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLanguage(l.id)}
                      className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        language === l.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mode selection tabs: Record Mic vs Upload File */}
            <div className="flex rounded-lg border p-1 bg-muted/30">
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition ${
                  mode === 'upload' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="h-3.5 w-3.5" /> Upload Audio File
              </button>
              <button
                type="button"
                onClick={() => setMode('record')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition ${
                  mode === 'record' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mic className="h-3.5 w-3.5" /> Record Microphone
              </button>
            </div>

            {/* Upload File Mode */}
            {mode === 'upload' && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  id="voice-file-input"
                  type="file"
                  accept="audio/*,video/mp4,video/3gpp,video/quicktime,.wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.webm,.flac,.mp4,.3gp,.amr,.caf,.wma,.m4b,.3ga"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleIncomingFile(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {!selectedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleIncomingFile(file);
                    }}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center space-y-2.5 transition-all ${
                      isDragging
                        ? 'border-primary bg-primary/10 scale-[1.01]'
                        : 'border-border/80 hover:border-primary/60 hover:bg-muted/30 bg-card'
                    }`}
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Click to upload or drag &amp; drop voice recording
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Supports WhatsApp voice notes &amp; audio clips (.mp3, .wav, .m4a, .opus, .ogg, .mp4, 10–60s)
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="mt-1 gap-1.5 text-xs font-medium"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Browse Audio File
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          <FileAudio className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{selectedFile.name}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <span className="text-emerald-600 font-medium">Ready to clone</span>
                            <span>•</span>
                            <span>{formatFileSize(selectedFile.size)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          className="h-7 text-xs px-2.5 gap-1"
                        >
                          <RefreshCw className="h-3 w-3" /> Change
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                          className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {uploadedAudioUrl && (
                      <div className="pt-1">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                          Audio Preview:
                        </p>
                        <audio controls src={uploadedAudioUrl} className="w-full h-8" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Record Mic Mode */}
            {mode === 'record' && (
              <div className="rounded-xl border p-4 space-y-3 text-center bg-card">
                {/* Script prompter */}
                <div className="rounded-lg bg-muted/40 p-3 text-left">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Suggested Script to Read Aloud:
                  </p>
                  <p className="text-xs text-foreground leading-relaxed italic font-medium">
                    &ldquo;{samplePrompts[language]}&rdquo;
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center py-2 space-y-2">
                  <div className="relative">
                    {isRecording && (
                      <span className="absolute -inset-1 rounded-full bg-red-500/30 animate-ping" />
                    )}
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition ${
                        isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'
                      }`}
                    >
                      {isRecording ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    </button>
                  </div>

                  <p className="text-xs font-medium">
                    {isRecording ? (
                      <span className="text-red-500 font-bold animate-pulse">
                        Recording... {recordingSeconds}s / 45s (Speak clearly)
                      </span>
                    ) : recordedAudioBlob ? (
                      <span className="text-emerald-600 font-semibold">
                        Clip recorded ({recordingSeconds}s) · Ready to clone
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Click to start recording (10–30s recommended)</span>
                    )}
                  </p>

                  {recordedAudioUrl && !isRecording && (
                    <div className="w-full pt-1">
                      <audio controls src={recordedAudioUrl} className="w-full h-8" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pricing Details Box */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-muted/40 border border-border p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 font-bold text-[11px]">
                  ₹
                </span>
                <div>
                  <span className="font-semibold text-foreground">Cloning Setup Fee:</span>{' '}
                  <span className="text-emerald-600 font-bold">₹10 One-time</span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Live Telephony Calling: <span className="font-mono font-bold text-foreground">₹10.0/min</span>
              </div>
            </div>

            {/* Information Alert */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                For best results, speak at a normal speaking pace in a quiet room without background noise. Our neural engine will synthesize and clone your vocal timbre in seconds.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleClone()}
                disabled={
                  isCloning ||
                  (mode === 'record' && (!recordedAudioBlob || isRecording)) ||
                  (mode === 'upload' && !selectedFile)
                }
                className="gap-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm"
              >
                {isCloning ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Synthesizing &amp; Cloning Voice...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Clone Voice Now · ₹10
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
