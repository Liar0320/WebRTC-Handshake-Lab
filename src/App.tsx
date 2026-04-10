/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Copy, 
  ClipboardPaste, 
  Zap, 
  ShieldCheck, 
  Activity, 
  MessageSquare, 
  Terminal,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  Info,
  Globe,
  MonitorSmartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type ConnectionState = {
  signalingState: RTCSignalingState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
};

type Message = {
  sender: 'me' | 'them';
  text: string;
  timestamp: Date;
};

type IceMode = 'stun' | 'local';

// --- Utilities ---

const encodeSignal = (obj: any) => {
  try {
    return btoa(JSON.stringify(obj));
  } catch (e) {
    return '';
  }
};

const decodeSignal = (str: string) => {
  try {
    return JSON.parse(atob(str));
  } catch (e) {
    return null;
  }
};

// --- Components ---

const StatusBadge = ({ label, state }: { label: string; state: string }) => {
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'connected':
      case 'completed':
      case 'stable':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'checking':
      case 'gathering':
      case 'have-local-offer':
      case 'have-remote-offer':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'failed':
      case 'disconnected':
      case 'closed':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className={`px-2 py-1 rounded-md border text-[10px] font-mono uppercase tracking-wider ${getStatusColor(state)}`}>
      <span className="opacity-60 mr-1">{label}:</span>
      <span className="font-bold">{state}</span>
    </div>
  );
};

export default function App() {
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const [iceMode, setIceMode] = useState<IceMode>('stun');
  const [localSignal, setLocalSignal] = useState<string>('');
  const [remoteSignalInput, setRemoteSignalInput] = useState<string>('');
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    signalingState: 'stable',
    iceConnectionState: 'new',
    iceGatheringState: 'new',
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isGathering, setIsGathering] = useState(false);
  const [sdpText, setSdpText] = useState<string>('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  // Initialize PeerConnection
  const initPC = useCallback(() => {
    if (pcRef.current) pcRef.current.close();
    
    // Configure ICE Servers based on user selection
    const config: RTCConfiguration = {
      iceServers: iceMode === 'stun' 
        ? [{ urls: "stun:stun.l.google.com:19302" }] 
        : [] // Empty array means Local Only (Host candidates)
    };
    
    const pc = new RTCPeerConnection(config);
    pcRef.current = pc;

    pc.onsignalingstatechange = () => {
      setConnectionState(prev => ({ ...prev, signalingState: pc.signalingState }));
    };

    pc.oniceconnectionstatechange = () => {
      setConnectionState(prev => ({ ...prev, iceConnectionState: pc.iceConnectionState }));
    };

    pc.onicegatheringstatechange = () => {
      setConnectionState(prev => ({ ...prev, iceGatheringState: pc.iceGatheringState }));
      if (pc.iceGatheringState === 'gathering') setIsGathering(true);
      if (pc.iceGatheringState === 'complete') setIsGathering(false);
    };

    return pc;
  }, [iceMode]);

  // Setup Data Channel listeners
  const setupDataChannel = (dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.onopen = () => console.log('Data channel opened');
    dc.onclose = () => console.log('Data channel closed');
    dc.onmessage = (e) => {
      setMessages(prev => [...prev, { sender: 'them', text: e.data, timestamp: new Date() }]);
    };
  };

  // Sender: Create Offer
  const startAsSender = async () => {
    setRole('sender');
    const pc = initPC();
    const dc = pc.createDataChannel("chat");
    setupDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setSdpText(offer.sdp || '');

    // Wait for ICE gathering to complete (Non-Trickle)
    pc.onicecandidate = (e) => {
      if (e.candidate === null) {
        setLocalSignal(encodeSignal(pc.localDescription));
      }
    };
  };

  // Receiver: Handle Offer and Create Answer
  const startAsReceiver = async () => {
    setRole('receiver');
  };

  const handleOfferFromSender = async () => {
    const remoteDesc = decodeSignal(remoteSignalInput);
    if (!remoteDesc || remoteDesc.type !== 'offer') {
      alert('Invalid Offer Signal');
      return;
    }

    const pc = initPC();
    pc.ondatachannel = (e) => {
      setupDataChannel(e.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setSdpText(answer.sdp || '');

    pc.onicecandidate = (e) => {
      if (e.candidate === null) {
        setLocalSignal(encodeSignal(pc.localDescription));
      }
    };
  };

  // Sender: Finalize with Answer
  const finalizeAsSender = async () => {
    const remoteDesc = decodeSignal(remoteSignalInput);
    if (!remoteDesc || remoteDesc.type !== 'answer') {
      alert('Invalid Answer Signal');
      return;
    }

    if (pcRef.current) {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(remoteDesc));
    }
  };

  const sendMessage = () => {
    if (dcRef.current && dcRef.current.readyState === 'open' && chatInput.trim()) {
      dcRef.current.send(chatInput);
      setMessages(prev => [...prev, { sender: 'me', text: chatInput, timestamp: new Date() }]);
      setChatInput('');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const isConnected = connectionState.iceConnectionState === 'connected' || connectionState.iceConnectionState === 'completed';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-5 h-5 text-slate-950 fill-current" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">WebRTC <span className="text-emerald-400">Handshake Lab</span></h1>
          </div>
          <div className="flex gap-2">
            <StatusBadge label="Signaling" state={connectionState.signalingState} />
            <StatusBadge label="ICE" state={connectionState.iceConnectionState} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Controls & Signaling */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Configuration & Role Selection */}
          {!role && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Network Config */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-400" />
                  Network Configuration
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    onClick={() => setIceMode('stun')}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      iceMode === 'stun' 
                        ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/50' 
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-bold ${iceMode === 'stun' ? 'text-emerald-400' : 'text-slate-300'}`}>Public (STUN)</span>
                      {iceMode === 'stun' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <p className="text-xs text-slate-500">Uses Google STUN. Works across different networks (4G to Wi-Fi).</p>
                  </button>
                  
                  <button
                    onClick={() => setIceMode('local')}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      iceMode === 'local' 
                        ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/50' 
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-bold ${iceMode === 'local' ? 'text-blue-400' : 'text-slate-300'}`}>Local Only</span>
                      {iceMode === 'local' && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                    </div>
                    <p className="text-xs text-slate-500">No servers. Only works if both peers are on the same Wi-Fi/LAN.</p>
                  </button>
                </div>
              </div>

              {/* Roles */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={startAsSender}
                  className="group p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all text-left space-y-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Activity className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Role: Sender</h3>
                    <p className="text-slate-400 text-sm mt-1">Initiate a connection by generating an Offer signal.</p>
                  </div>
                </button>
                <button 
                  onClick={startAsReceiver}
                  className="group p-8 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 transition-all text-left space-y-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShieldCheck className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Role: Receiver</h3>
                    <p className="text-slate-400 text-sm mt-1">Wait for an Offer and generate an Answer signal.</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {role && (
            <AnimatePresence mode="wait">
              <motion.div 
                key={role}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Step 1: Local Signal Generation */}
                <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">1</div>
                      <h2 className="font-semibold">My Signal (Local)</h2>
                    </div>
                    {isGathering && (
                      <div className="flex items-center gap-2 text-xs text-amber-400 font-mono animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        ICE GATHERING...
                      </div>
                    )}
                  </div>
                  <div className="p-6 space-y-4">
                    {localSignal ? (
                      <div className="space-y-3">
                        <div className="relative group">
                          <textarea 
                            readOnly 
                            value={localSignal}
                            className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-400 resize-none focus:outline-none"
                          />
                          <button 
                            onClick={() => copyToClipboard(localSignal)}
                            className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-emerald-500 text-slate-200 hover:text-slate-950 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Info className="w-3 h-3" />
                          Copy this signal and send it to your peer.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                          <Zap className="w-8 h-8 text-slate-600" />
                        </div>
                        <div>
                          <p className="text-slate-400">No signal generated yet.</p>
                          {role === 'sender' && (
                            <button 
                              onClick={startAsSender}
                              className="mt-4 px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-colors"
                            >
                              Generate Offer
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Step 2: Remote Signal Input */}
                <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">2</div>
                      <h2 className="font-semibold">Peer Signal (Remote)</h2>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="relative">
                      <textarea 
                        placeholder="Paste the signal from your peer here..."
                        value={remoteSignalInput}
                        onChange={(e) => setRemoteSignalInput(e.target.value)}
                        className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 resize-none focus:border-blue-500/50 focus:outline-none transition-colors"
                      />
                      <ClipboardPaste className="absolute bottom-3 right-3 w-4 h-4 text-slate-600 pointer-events-none" />
                    </div>
                    
                    <div className="flex justify-end">
                      {role === 'sender' ? (
                        <button 
                          disabled={!remoteSignalInput || isConnected}
                          onClick={finalizeAsSender}
                          className="px-6 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:hover:bg-blue-500 text-slate-950 font-bold rounded-xl transition-colors flex items-center gap-2"
                        >
                          Finalize Connection
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      ) : (
                        <button 
                          disabled={!remoteSignalInput || !!localSignal}
                          onClick={handleOfferFromSender}
                          className="px-6 py-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:hover:bg-blue-500 text-slate-950 font-bold rounded-xl transition-colors flex items-center gap-2"
                        >
                          Accept Invite & Generate Answer
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Reset */}
                <button 
                  onClick={() => {
                    setRole(null);
                    setLocalSignal('');
                    setRemoteSignalInput('');
                    setSdpText('');
                    setMessages([]);
                    if (pcRef.current) pcRef.current.close();
                  }}
                  className="w-full py-3 border border-slate-800 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-900 transition-all text-sm font-medium"
                >
                  Reset Session
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Right Column: SDP Inspector & Chat */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* SDP Inspector */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col h-[300px]">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <h2 className="font-semibold text-sm">SDP Inspector</h2>
            </div>
            <div className="flex-1 bg-slate-950 p-4 font-mono text-[10px] text-slate-500 overflow-y-auto whitespace-pre">
              {sdpText || '// No SDP generated yet. Start a session to see the Session Description Protocol details.'}
            </div>
          </section>

          {/* Chat / Data Channel */}
          <section className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col h-[400px]">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <h2 className="font-semibold text-sm">P2P Data Channel</h2>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">
                  <CheckCircle2 className="w-3 h-3" />
                  Live
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                  <AlertCircle className="w-3 h-3" />
                  Offline
                </div>
              )}
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950/50">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 opacity-40">
                  <MessageSquare className="w-8 h-8" />
                  <p className="text-xs">Once connected, messages sent over the Data Channel will appear here.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                    m.sender === 'me' 
                      ? 'bg-emerald-500 text-slate-950 font-medium rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 rounded-tl-none'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-900/50 border-t border-slate-800">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  disabled={!isConnected}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={isConnected ? "Type a message..." : "Connect to chat"}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                />
                <button 
                  disabled={!isConnected || !chatInput.trim()}
                  onClick={sendMessage}
                  className="p-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-lg transition-colors"
                >
                  <Zap className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* Footer / Education */}
      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-slate-800/60">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <h4 className="font-bold text-slate-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              What is SDP?
            </h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Session Description Protocol is a format for describing multimedia communication sessions. It defines codecs, network addresses, and security parameters.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="font-bold text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              What is ICE?
            </h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Interactive Connectivity Establishment is a framework to allow your web browser to connect with peers. It finds the best path (Direct, STUN, or TURN).
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="font-bold text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              No Server?
            </h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Usually, a signaling server (WebSockets) automates this exchange. Here, you are the signaling server, manually moving the "handshake" data.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
