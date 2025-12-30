import React from 'react';

export const Box: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = '', title }) => (
  <div className={`relative p-3 bg-black/80 backdrop-blur-sm group ${className}`}>
    {/* Main Border */}
    <div className="absolute inset-0 border border-[#0f0]/30" />
    
    {/* Corner Brackets */}
    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t-2 border-l-2 border-[#0f0]" />
    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t-2 border-r-2 border-[#0f0]" />
    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b-2 border-l-2 border-[#0f0]" />
    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b-2 border-r-2 border-[#0f0]" />

    {/* Background Grid Pattern */}
    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,0,0.03)_1px,transparent_1px)] bg-[size:10px_10px] pointer-events-none" />

    {title && (
      <div className="absolute -top-3 left-3 bg-black px-2 flex items-center gap-2">
         <div className="w-1 h-1 bg-[#0f0] animate-pulse" />
         <span className="text-[#0f0] text-[10px] font-bold font-cyber tracking-widest uppercase shadow-[0_0_5px_rgba(0,255,0,0.4)]">
          {title}
         </span>
      </div>
    )}
    <div className="relative z-10">
      {children}
    </div>
  </div>
);

export const Button: React.FC<{ onClick: () => void; children: React.ReactNode; active?: boolean; className?: string }> = ({ onClick, children, active, className='' }) => (
  <button
    onClick={onClick}
    className={`
      relative px-4 py-2 font-bold uppercase tracking-wider text-xs transition-all duration-200
      border border-[#0f0] overflow-hidden group
      ${active ? 'bg-[#0f0] text-black shadow-[0_0_10px_#0f0]' : 'bg-transparent text-[#0f0] hover:bg-[#0f0]/10'}
      ${className}
    `}
  >
    {/* Button Glitch Effect Overlay */}
    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-100 ease-out pointer-events-none" />
    <div className="relative flex items-center justify-center">
        {children}
    </div>
  </button>
);