import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';

// Audio Context Helpers
let inputAudioContext: AudioContext | null = null;
let outputAudioContext: AudioContext | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let inputSource: MediaStreamAudioSourceNode | null = null;
let nextStartTime = 0;
const sources = new Set<AudioBufferSourceNode>();

// Tool Definitions
const changeBrushColorDeclaration: FunctionDeclaration = {
  name: 'changeBrushColor',
  parameters: {
    type: Type.OBJECT,
    description: 'Change the drawing brush color. Valid colors are hex codes or standard names like "red", "cyan", "neon green".',
    properties: {
      color: {
        type: Type.STRING,
        description: 'The color to change to.',
      },
    },
    required: ['color'],
  },
};

const clearCanvasDeclaration: FunctionDeclaration = {
  name: 'clearCanvas',
  parameters: {
    type: Type.OBJECT,
    description: 'Clear the entire drawing canvas.',
    properties: {},
  },
};

export interface GeminiLiveConfig {
  onColorChange: (color: string) => void;
  onClearCanvas: () => void;
  onStatusChange: (status: string) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null; // Typing for session is complex in preview
  private config: GeminiLiveConfig;
  private isConnected = false;

  constructor(config: GeminiLiveConfig) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.config = config;
  }

  async connect(videoStream: MediaStream) {
    if (this.isConnected) return;
    
    this.config.onStatusChange("INITIALIZING UPLINK...");

    try {
      inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const outputNode = outputAudioContext.createGain();
      outputNode.connect(outputAudioContext.destination);

      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.config.onStatusChange("SYSTEM ONLINE");
            this.isConnected = true;

            // Setup Audio Input
            if (inputAudioContext) {
                inputSource = inputAudioContext.createMediaStreamSource(videoStream);
                scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                
                scriptProcessor.onaudioprocess = (e) => {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmBlob = this.createBlob(inputData);
                  sessionPromise.then((session) => {
                    session.sendRealtimeInput({ media: pcmBlob });
                  });
                };
                
                inputSource.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContext.destination);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContext) {
               nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
               const audioBuffer = await this.decodeAudioData(
                 this.decode(base64Audio),
                 outputAudioContext,
                 24000,
                 1
               );
               const source = outputAudioContext.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(outputNode);
               source.addEventListener('ended', () => sources.delete(source));
               source.start(nextStartTime);
               nextStartTime += audioBuffer.duration;
               sources.add(source);
            }

            // Handle Tool Calls
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                    if (fc.name === 'changeBrushColor') {
                        const color = (fc.args as any).color;
                        this.config.onColorChange(color);
                        sessionPromise.then(s => s.sendToolResponse({
                            functionResponses: { id: fc.id, name: fc.name, response: { result: `Color changed to ${color}` } }
                        }));
                    } else if (fc.name === 'clearCanvas') {
                        this.config.onClearCanvas();
                        sessionPromise.then(s => s.sendToolResponse({
                            functionResponses: { id: fc.id, name: fc.name, response: { result: "Canvas cleared" } }
                        }));
                    }
                }
            }
          },
          onclose: () => {
            this.config.onStatusChange("DISCONNECTED");
            this.isConnected = false;
          },
          onerror: (e) => {
            console.error(e);
            this.config.onStatusChange("ERROR: SIGNAL LOST");
            this.isConnected = false;
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are a cool, edgy Y2K cyberpunk AI assistant. You are watching the user draw in a virtual interface. Comment on their hand gestures and drawings with slang like 'radical', 'glitchy', 'nova'. The user can ask you to change the brush color or clear the screen. Be brief and energetic.",
          tools: [{ functionDeclarations: [changeBrushColorDeclaration, clearCanvasDeclaration] }]
        }
      });
      
      this.session = sessionPromise;

    } catch (error) {
        console.error("Connection failed", error);
        this.config.onStatusChange("CONNECTION FAILED");
    }
  }

  async sendVideoFrame(base64Image: string) {
    if (this.session) {
        const s = await this.session;
        s.sendRealtimeInput({
            media: {
                mimeType: 'image/jpeg',
                data: base64Image
            }
        });
    }
  }

  disconnect() {
      // Cleanup audio nodes
      if (inputSource) inputSource.disconnect();
      if (scriptProcessor) scriptProcessor.disconnect();
      if (inputAudioContext) inputAudioContext.close();
      if (outputAudioContext) outputAudioContext.close();
      this.isConnected = false;
      // Ideally call session.close() if available in SDK version
      this.config.onStatusChange("OFFLINE");
  }

  // Audio Utils
  private createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for(let i=0; i<bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);

    return {
      data: b64,
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
     const dataInt16 = new Int16Array(data.buffer);
     const frameCount = dataInt16.length / numChannels;
     const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
     for(let c=0; c<numChannels; c++) {
         const channelData = buffer.getChannelData(c);
         for(let i=0; i<frameCount; i++) {
             channelData[i] = dataInt16[i * numChannels + c] / 32768.0;
         }
     }
     return buffer;
  }
}
