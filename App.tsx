import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { VisionService } from './services/visionService';
import { DrawingPath, Point, ShapeMode } from './types';
import { Box, Button } from './components/RetroUI';
import { Trash2, Triangle, Circle as CircleIcon, Square, ScanFace, Eraser, Heart, Gem } from 'lucide-react';

// Configuration
const GESTURE_HOLD_TIME = 2500; // 2.5s for a heavy, deliberate feel

// Connections for standard skeleton
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [9, 10], [10, 11], [11, 12], // Middle
  [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [5, 9], [9, 13], [13, 17], // Palm
];

const DrawingApp: React.FC = () => {
  // State
  const [visionReady, setVisionReady] = useState(false);
  const [currentColor, setCurrentColor] = useState('#00ff00');
  const [brushSize, setBrushSize] = useState(6); // Default brush size slightly thicker
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [fps, setFps] = useState(0);
  const [activeGesture, setActiveGesture] = useState<string>("SCANNING...");

  // Creation State
  const [creationProgress, setCreationProgress] = useState(0);
  const creationStartTimeRef = useRef<number | null>(null);
  const pendingShapeRef = useRef<{type: ShapeMode, points: Point[]} | null>(null);
  const isGestureLockedRef = useRef(false);

  // Refs
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visionServiceRef = useRef<VisionService | null>(null);
  const requestRef = useRef<number | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      visionServiceRef.current = new VisionService();
      await visionServiceRef.current.initialize();
      setVisionReady(true);
    };
    init();

    return () => {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Helpers
  const distance = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  
  const getWobbledPoint = (p: Point, seed: number, time: number) => {
    const dx = Math.sin(time * 0.005 + p.y * 0.05 + seed) * 1.5;
    const dy = Math.cos(time * 0.003 + p.x * 0.05 + seed) * 1.5;
    return { x: p.x + dx, y: p.y + dy };
  };

  const isFingerExtended = (landmarks: any[], fingerTipIdx: number, fingerPipIdx: number, wristIdx: number = 0) => {
      const tip = landmarks[fingerTipIdx];
      const pip = landmarks[fingerPipIdx];
      const wrist = landmarks[wristIdx];
      return distance(tip, wrist) > distance(pip, wrist);
  };

  // --- RENDERING FUNCTIONS ---

  const drawCyberFace = (ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number, color: string, time: number, video: HTMLVideoElement | null) => {
      const points = landmarks.map(l => ({ x: l.x * width, y: l.y * height }));
      
      // 0. BLUR EFFECT (Right Eye Area - Index 468)
      if (video && points[468]) {
         const p = points[468];
         const boxSize = 100; // Large square blur
         const sx = p.x - boxSize/2;
         const sy = p.y - boxSize/2;
         
         ctx.save();
         ctx.beginPath();
         ctx.rect(sx, sy, boxSize, boxSize);
         ctx.clip();
         
         // Heavy blur filter
         ctx.filter = 'blur(12px) brightness(1.1)';
         // Draw the video frame content into this rect
         ctx.drawImage(video, sx, sy, boxSize, boxSize, sx, sy, boxSize, boxSize);
         
         // Frosty Overlay
         ctx.fillStyle = 'rgba(200, 220, 255, 0.15)';
         ctx.fillRect(sx, sy, boxSize, boxSize);
         
         ctx.filter = 'none';
         
         // Corner Accents for the blur box
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
         ctx.lineWidth = 1;
         const cornerLen = 10;
         // TL
         ctx.strokeRect(sx, sy, cornerLen, 1); ctx.strokeRect(sx, sy, 1, cornerLen);
         // TR
         ctx.strokeRect(sx + boxSize - cornerLen, sy, cornerLen, 1); ctx.strokeRect(sx + boxSize, sy, 1, cornerLen);
         // BL
         ctx.strokeRect(sx, sy + boxSize, cornerLen, 1); ctx.strokeRect(sx, sy + boxSize - cornerLen, 1, cornerLen);
         // BR
         ctx.strokeRect(sx + boxSize - cornerLen, sy + boxSize, cornerLen, 1); ctx.strokeRect(sx + boxSize, sy + boxSize - cornerLen, 1, cornerLen);
         
         ctx.restore();
      }

      // 1. SCIENTIFIC ANNOTATIONS
      const features = [
        { idx: 473, label: "ID: 2 - Iris Left", dx: -80, dy: -50 },
        { idx: 1, label: "ID: 4 - Nasal Bridge", dx: 80, dy: -30 },
        { idx: 13, label: "ID: 7 - Oral Cavity", dx: -70, dy: 60 },
        { idx: 10, label: "ID: 1 - Frontal Bone", dx: 60, dy: -80 }
      ];

      ctx.save();
      ctx.font = '10px "VT323"';
      ctx.lineWidth = 1;
      
      features.forEach((f, i) => {
          const p = points[f.idx];
          if(p) {
              const size = 16;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.strokeRect(p.x - size/2, p.y - size/2, size, size);

              const endX = p.x + f.dx;
              const endY = p.y + f.dy;
              
              ctx.beginPath();
              ctx.moveTo(p.x, p.y - size/2); 
              ctx.lineTo(p.x, endY);
              ctx.lineTo(endX, endY);
              ctx.stroke();

              const textWidth = ctx.measureText(f.label).width + 10;
              const labelBoxX = f.dx > 0 ? endX : endX - textWidth;
              
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(labelBoxX, endY - 10, textWidth, 14);
              ctx.strokeRect(labelBoxX, endY - 10, textWidth, 14);
              
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.fillText(f.label, labelBoxX + 5, endY);
              
              ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
              ctx.fillText(`[${p.x.toFixed(0)}, ${p.y.toFixed(0)}]`, labelBoxX, endY + 12);
          }
      });
      ctx.restore();

      // 2. MINIMALIST JAWLINE
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; 
      ctx.lineWidth = 1;
      const jawIndices = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];
      jawIndices.forEach((idx, i) => {
          const p = points[idx];
          if (p) {
            if(i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
      });
      ctx.stroke();
  };

  const drawCyberHand = (ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number, color: string) => {
    const points = landmarks.map(l => ({ x: l.x * width, y: l.y * height }));
    
    // 1. Vertical Scanning Lines
    const tips = [4, 8, 12, 16, 20];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15;
    ctx.setLineDash([2, 4]);
    tips.forEach(idx => {
        const p = points[idx];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, height); // Drop to bottom
        ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    // 2. The "Web"
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    const wrist = points[0];
    tips.forEach(t1 => {
        const p1 = points[t1];
        ctx.moveTo(wrist.x, wrist.y);
        ctx.lineTo(p1.x, p1.y);
        tips.forEach(t2 => {
            if (t1 !== t2) {
                const p2 = points[t2];
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
        });
    });
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // 3. Standard Skeleton
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    HAND_CONNECTIONS.forEach(([i, j]) => {
       ctx.moveTo(points[i].x, points[i].y);
       ctx.lineTo(points[j].x, points[j].y);
    });
    ctx.stroke();

    // 4. Tech Nodes
    points.forEach((p, i) => {
       if (i % 4 === 0 || i === 0) { 
         const isTip = tips.includes(i);
         const size = isTip ? 6 : 4;
         ctx.strokeStyle = color;
         ctx.strokeRect(p.x - size/2, p.y - size/2, size, size);
         
         if (isTip) {
             ctx.fillStyle = '#fff';
             ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
             
             if (i === 8) { // Index tip
                 ctx.fillStyle = color;
                 ctx.font = '10px "VT323"';
                 ctx.fillText(`[${Math.floor(p.x)}, ${Math.floor(p.y)}]`, p.x + 10, p.y - 10);
             }
         }
       }
    });
  };

  // Main Loop
  const animate = useCallback(() => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    
    if (video && video.readyState === 4 && canvas && visionReady && visionServiceRef.current) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (canvas.width !== video.videoWidth) {
         canvas.width = video.videoWidth;
         canvas.height = video.videoHeight;
      }

      const now = Date.now();
      const startTimeMs = performance.now();
      const results = visionServiceRef.current.detect(video, startTimeMs);
      
      const fpsCalc = 1000 / (performance.now() - startTimeMs);
      setFps(prev => Math.round(prev * 0.9 + fpsCalc * 0.1));

      // --- CLEAR & DRAW HISTORY ---
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      paths.forEach(path => {
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        // Apply individual path width
        ctx.lineWidth = path.width || 2; 
        const seed = path.wobbleSeed || 0;
        const pts = path.points.map(p => getWobbledPoint(p, seed, now));

        if (pts.length > 0) {
           ctx.moveTo(pts[0].x, pts[0].y);
           pts.forEach(p => ctx.lineTo(p.x, p.y));
        }
        
        if (![ShapeMode.LINE, ShapeMode.FREEHAND].includes(path.type)) ctx.closePath();
        
        ctx.shadowBlur = 5;
        ctx.shadowColor = path.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // --- PROCESS VISION RESULTS ---
      let detectedShape: {type: ShapeMode, points: Point[]} | null = null;
      let gestureName = "AWAITING_INPUT";

      if (results) {
          // 1. Draw Faces
          if (results.faces && results.faces.faceLandmarks) {
              results.faces.faceLandmarks.forEach((landmarks: any[]) => {
                  drawCyberFace(ctx, landmarks, canvas.width, canvas.height, currentColor, now, video);
              });
          }

          // 2. Draw Hands & Detect Gestures
          if (results.hands && results.hands.landmarks && results.hands.landmarks.length > 0) {
            results.hands.landmarks.forEach((landmarks: any[]) => {
                drawCyberHand(ctx, landmarks, canvas.width, canvas.height, currentColor);
            });

            const h1 = results.hands.landmarks[0];
            const h2 = results.hands.landmarks[1];
            const pt = (idx: number, hand: any = h1) => ({ x: hand[idx].x * canvas.width, y: hand[idx].y * canvas.height });

            // --- DUAL HAND LOGIC ---
            if (h2) {
                const h1Index = pt(8, h1); const h2Index = pt(8, h2);
                const h1Thumb = pt(4, h1); const h2Thumb = pt(4, h2);
                const handDist = distance(h1Index, h2Index);
                
                // Check for Heart/Diamond (Tips close)
                const indexClose = distance(h1Index, h2Index) < 80;
                const thumbsClose = distance(h1Thumb, h2Thumb) < 80;

                if (indexClose && thumbsClose) {
                    // Both tips touching. Now distinguish Heart vs Diamond based on index finger angle.
                    const getAngle = (p1: Point, p2: Point, p3: Point) => {
                        const v1 = {x: p1.x-p2.x, y: p1.y-p2.y}; // PIP to MCP
                        const v2 = {x: p3.x-p2.x, y: p3.y-p2.y}; // PIP to Tip
                        const dot = v1.x*v2.x + v1.y*v2.y;
                        const mag1 = Math.hypot(v1.x, v1.y);
                        const mag2 = Math.hypot(v2.x, v2.y);
                        return Math.acos(dot / (mag1 * mag2)) * (180/Math.PI);
                    };

                    // Angle at PIP (Index Finger Joint 6)
                    // P1: MCP (5), P2: PIP (6), P3: TIP (8)
                    const angle1 = getAngle(pt(5, h1), pt(6, h1), pt(8, h1));
                    const angle2 = getAngle(pt(5, h2), pt(6, h2), pt(8, h2));
                    const avgAngle = (angle1 + angle2) / 2;

                    // If bent (< 150deg approx), it's a Heart. If straight, it's a Diamond.
                    if (avgAngle < 150) { 
                        gestureName = "HEART_SIGN";
                        // Heart Calculation
                        const topX = (h1Index.x + h2Index.x) / 2;
                        const topY = (h1Index.y + h2Index.y) / 2;
                        const bottomX = (h1Thumb.x + h2Thumb.x) / 2;
                        const bottomY = (h1Thumb.y + h2Thumb.y) / 2;
                        const width = distance(pt(5, h1), pt(5, h2)) * 1.5; // Width based on knuckles
                        
                        // Create Heart Path Parametrically
                        const hPts = [];
                        const scale = width / 35; // Scaling factor
                        const cx = (topX + bottomX) / 2;
                        const cy = (topY + bottomY) / 2 - (10 * scale);

                        for(let t=0; t<Math.PI*2; t+=0.1) {
                            // Heart Equation
                            const x = 16 * Math.pow(Math.sin(t), 3);
                            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
                            hPts.push({ x: cx + x * scale, y: cy + y * scale });
                        }
                        detectedShape = { type: ShapeMode.HEART, points: hPts };

                    } else {
                        gestureName = "DIAMOND_SIGN";
                        // Diamond Calculation
                        const top = { x: (h1Index.x + h2Index.x) / 2, y: (h1Index.y + h2Index.y) / 2 };
                        const bottom = { x: (h1Thumb.x + h2Thumb.x) / 2, y: (h1Thumb.y + h2Thumb.y) / 2 };
                        const midY = (top.y + bottom.y) / 2;
                        
                        // Use MCPs (Knuckles) for width
                        const h1MCP = pt(5, h1);
                        const h2MCP = pt(5, h2);
                        const width = distance(h1MCP, h2MCP);
                        const cx = (top.x + bottom.x) / 2;

                        const left = { x: cx - width/2, y: midY };
                        const right = { x: cx + width/2, y: midY };

                        detectedShape = { type: ShapeMode.DIAMOND, points: [top, right, bottom, left, top] };
                    }
                } 
                // Gesture: FRAME RECTANGLE (Only if hands far apart)
                else if (handDist > 150) {
                    gestureName = "FRAME_RECT";
                    detectedShape = {
                        type: ShapeMode.RECTANGLE,
                        points: [
                            { x: Math.min(h1Index.x, h2Index.x), y: Math.min(h1Index.y, h2Index.y) },
                            { x: Math.max(h1Index.x, h2Index.x), y: Math.min(h1Index.y, h2Index.y) },
                            { x: Math.max(h1Index.x, h2Index.x), y: Math.max(h1Index.y, h2Index.y) },
                            { x: Math.min(h1Index.x, h2Index.x), y: Math.max(h1Index.y, h2Index.y) },
                            { x: Math.min(h1Index.x, h2Index.x), y: Math.min(h1Index.y, h2Index.y) }
                        ]
                    };
                }
            } else {
                // --- SINGLE HAND LOGIC ---
                const h1Raw = results.hands.landmarks[0];
                const thumb = pt(4); const index = pt(8); const middle = pt(12); 
                const ring = pt(16); const pinky = pt(20); const wrist = pt(0);

                // Detect Open Palm (Eraser)
                const isPalmOpen = 
                    isFingerExtended(h1Raw, 8, 6) &&
                    isFingerExtended(h1Raw, 12, 10) &&
                    isFingerExtended(h1Raw, 16, 14) &&
                    isFingerExtended(h1Raw, 20, 18) &&
                    distance(thumb, pinky) > 60; // Spread wide

                if (isPalmOpen) {
                    gestureName = "ERASER_ACTIVE";
                    const eraseRadius = 45; // Larger radius

                    ctx.save();
                    
                    // 1. Define the Eraser Area
                    ctx.beginPath();
                    ctx.arc(index.x, index.y, eraseRadius, 0, Math.PI * 2);
                    ctx.clip(); // Clip drawing to circle

                    // 2. Draw Digital Static/Noise
                    const imgData = ctx.createImageData(eraseRadius * 2, eraseRadius * 2);
                    const data = imgData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const val = Math.random() * 255;
                        const isBright = Math.random() > 0.8;
                        data[i] = isBright ? 255 : 0;     // R
                        data[i + 1] = isBright ? 255 : 0; // G
                        data[i + 2] = isBright ? 255 : 0; // B
                        data[i + 3] = Math.random() * 150; // Alpha
                    }
                    ctx.putImageData(imgData, index.x - eraseRadius, index.y - eraseRadius);

                    // 3. Draw Red Border
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#ff0000';
                    ctx.shadowBlur = 15;
                    ctx.stroke();
                    
                    // 4. "DELETING" Text
                    ctx.font = 'bold 10px "Orbitron"';
                    ctx.fillStyle = '#ff0000';
                    ctx.fillText("ERASING DATA...", index.x - 40, index.y + eraseRadius + 15);

                    ctx.restore();

                    // ERASE LOGIC
                    let hasErased = false;
                    const newPaths = paths.map(path => {
                        const newPoints = path.points.filter(p => distance(p, index) > eraseRadius);
                        if (newPoints.length !== path.points.length) hasErased = true;
                        return { ...path, points: newPoints };
                    }).filter(path => path.points.length > 1); // Remove single points

                    if (hasErased) {
                        setPaths(newPaths);
                    }

                } else if (distance(thumb, index) < 50 && distance(index, middle) > 60) {
                    gestureName = "CIRCLE_LOOP";
                    const center = { x: (thumb.x + index.x)/2, y: (thumb.y + index.y)/2 };
                    const radius = distance(center, wrist) * 0.55;
                    const cPts = [];
                    for(let i=0; i<=360; i+=15) cPts.push({ x: center.x + radius*Math.cos(i*Math.PI/180), y: center.y + radius*Math.sin(i*Math.PI/180) });
                    detectedShape = { type: ShapeMode.CIRCLE, points: cPts };
                }
                else if (distance(thumb, index) > 60 && distance(index, middle) > 60 && distance(thumb, middle) > 60) {
                    gestureName = "TRIANGLE_DELTA";
                    detectedShape = { type: ShapeMode.TRIANGLE, points: [thumb, index, middle, thumb] };
                }
                else if (distance(thumb, pinky) > 100 && distance(index, wrist) < distance(index, pt(5))) {
                    gestureName = "LINE_VECTOR";
                    detectedShape = { type: ShapeMode.LINE, points: [thumb, pinky] };
                }
            }
          }
      }

      // --- CREATION & PROGRESS LOGIC ---
      if (detectedShape) {
          if (isGestureLockedRef.current) {
              setActiveGesture("RELEASE_HAND");
          } else {
              if (creationStartTimeRef.current === null) creationStartTimeRef.current = Date.now();
              
              const elapsed = Date.now() - creationStartTimeRef.current;
              const progress = Math.min(elapsed / GESTURE_HOLD_TIME, 1);
              setCreationProgress(progress);

              // Draw Preview
              ctx.strokeStyle = progress > 0.9 ? '#fff' : currentColor;
              ctx.lineWidth = brushSize; 
              ctx.setLineDash(progress < 1 ? [5, 5] : []);
              
              const gx = (Math.random()-0.5) * 5 * (1-progress);
              
              ctx.beginPath();
              detectedShape.points.forEach((p, i) => {
                  if(i===0) ctx.moveTo(p.x + gx, p.y);
                  else ctx.lineTo(p.x + gx, p.y);
              });
              ctx.stroke();
              ctx.setLineDash([]);

              const center = detectedShape.points[0];
              const size = 50 * (1.5 - progress);
              ctx.strokeStyle = currentColor;
              ctx.strokeRect(center.x - size/2, center.y - size/2, size, size);

              const bars = Math.floor(progress * 10);
              const barStr = "||||||||||".substring(0, bars) + "..........".substring(bars);
              setActiveGesture(`${gestureName} [${barStr}]`);

              if (progress >= 1 && pendingShapeRef.current === null) {
                  const wobbleSeed = Math.random() * 1000;
                  setPaths(prev => [...prev, {
                      points: detectedShape!.points,
                      color: currentColor,
                      width: brushSize, 
                      type: detectedShape!.type,
                      timestamp: Date.now(),
                      wobbleSeed
                  }]);
                  pendingShapeRef.current = detectedShape;
                  creationStartTimeRef.current = null;
                  isGestureLockedRef.current = true;
              }
          }
      } else {
          isGestureLockedRef.current = false;
          creationStartTimeRef.current = null;
          setCreationProgress(0);
          pendingShapeRef.current = null;
          if (!activeGesture.startsWith("ERASER") && !activeGesture.startsWith("CALIBRATING")) {
             setActiveGesture("SCANNING...");
          }
      }
    }
    
    requestRef.current = requestAnimationFrame(animate);
  }, [visionReady, currentColor, paths, brushSize]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); }
  }, [animate]);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none cursor-crosshair text-[#0f0] font-mono">
      {/* Background FX */}
      <div className="scanlines opacity-40" />
      <div className="vignette opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      
      {/* Video & Canvas */}
      <Webcam
        ref={webcamRef}
        audio={false}
        className="absolute top-0 left-0 w-full h-full object-cover opacity-30 grayscale contrast-125 brightness-75 mix-blend-screen"
        screenshotFormat="image/jpeg"
        videoConstraints={{ facingMode: "user", width: 1280, height: 720 }}
      />
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />

      {/* --- UI LAYER --- */}
      
      {/* Top Bar */}
      <div className="absolute top-0 w-full p-4 flex justify-between items-start z-50 pointer-events-none">
        <Box title="SYS.DIAGNOSTICS" className="w-64 pointer-events-auto">
             <div className="flex justify-between border-b border-[#0f0]/30 pb-1 mb-1 text-[10px] tracking-widest">
               <span className="opacity-70">FPS</span>
               <span>{fps.toString().padStart(3, '0')}</span>
             </div>
             <div className="flex justify-between border-b border-[#0f0]/30 pb-1 mb-1 text-[10px] tracking-widest">
               <span className="opacity-70">SENSOR</span>
               <span className={visionReady ? "text-[#0f0]" : "text-red-500 animate-pulse"}>{visionReady ? "ONLINE" : "INIT..."}</span>
             </div>
             <div className="flex justify-between border-b border-[#0f0]/30 pb-1 mb-1 text-[10px] tracking-widest">
               <span className="opacity-70">BRUSH SIZE</span>
               <span>{brushSize}px</span>
             </div>
             <div className="text-center bg-[#001100] border border-[#0f0]/30 p-1 text-xs font-bold mt-2">
                {activeGesture}
             </div>
             {/* Progress Bar */}
             <div className="mt-1 h-1 bg-black w-full relative">
                <div className="absolute h-full bg-[#0f0] transition-all duration-75" style={{ width: `${creationProgress * 100}%` }} />
             </div>
        </Box>

        <div className="text-right">
           <h1 className="text-5xl font-cyber text-white font-bold italic tracking-tighter drop-shadow-[0_0_15px_rgba(0,255,0,0.5)]">
             CYBER<span className="text-[#0f0]">HAND</span>
           </h1>
           <div className="text-[10px] tracking-[0.6em] mt-1 opacity-70">NEURAL_INTERFACE_V3</div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-8 w-full flex justify-center gap-6 z-50 items-end pointer-events-none">
         <div className="pointer-events-auto flex gap-4">
            <Box title="CHROMATICS" className="flex gap-2 bg-black/90">
                {['#00ff00', '#00ffff', '#ff00ff', '#ffff00', '#ffffff'].map(c => (
                    <button
                    key={c}
                    onClick={() => setCurrentColor(c)}
                    className={`w-5 h-5 border hover:scale-125 transition-transform ${currentColor === c ? 'border-white bg-white/20' : 'border-transparent opacity-50'} shadow-[0_0_8px_${c}]`}
                    style={{ backgroundColor: c }}
                    />
                ))}
            </Box>
            <Box title="OPERATIONS" className="flex gap-2 bg-black/90">
                <Button onClick={() => setPaths([])}>
                    <Trash2 size={16} /> <span className="ml-2">PURGE</span>
                </Button>
            </Box>
         </div>
      </div>

      {/* Legend */}
      <div className="absolute left-6 top-32 z-40 pointer-events-none space-y-3 opacity-80">
          {[
            { Icon: Eraser, label: "ERASE", sub: "OPEN PALM" },
            { Icon: Heart, label: "HEART", sub: "HAND SIGN" },
            { Icon: Gem, label: "DIAMOND", sub: "HAND SIGN" },
            { Icon: CircleIcon, label: "CIRCLE", sub: "OK SIGN" },
            { Icon: Square, label: "RECT", sub: "FRAME" },
            { Icon: Triangle, label: "TRI", sub: "3 FINGER" },
            { Icon: ScanFace, label: "FACE", sub: "TRACKING" }
          ].map((item, i) => (
             <div key={i} className="flex items-center gap-3">
                <div className="bg-black/50 border border-[#0f0]/40 p-1">
                    <item.Icon size={12} className="text-[#0f0]" />
                </div>
                <div className="text-[9px] leading-tight">
                    <div className="font-bold">{item.label}</div>
                    <div className="opacity-50 tracking-wider">{item.sub}</div>
                </div>
             </div>
          ))}
      </div>

    </div>
  );
};

export default DrawingApp;