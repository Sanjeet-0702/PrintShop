import React from "react";

export default function PrinterIllustration({ width = 360, height = 300, className = "" }) {
  return (
    <div className={`printer-illustration-wrap ${className}`} style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 400 340"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Paper feeder on top */}
        <rect x="145" y="45" width="110" height="75" rx="6" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="2" />
        <line x1="160" y1="65" x2="240" y2="65" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
        <line x1="160" y1="78" x2="230" y2="78" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
        <line x1="160" y1="91" x2="215" y2="91" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />

        {/* Printer main body base */}
        <rect x="135" y="115" width="130" height="135" rx="8" fill="#FFFFFF" stroke="#475569" strokeWidth="3" />

        {/* Printer yellow scanner hood */}
        <rect x="110" y="95" width="180" height="90" rx="10" fill="#F6C844" stroke="#D99E10" strokeWidth="2" />
        <rect x="125" y="108" width="150" height="64" rx="6" fill="#FFF2B2" />
        <path d="M125 145 L275 145" stroke="#FDE047" strokeWidth="2" strokeDasharray="4 4" />

        {/* Paper output from printer */}
        <g filter="drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.06))">
          <rect x="140" y="145" width="120" height="110" rx="6" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="2" />
          <rect x="150" y="158" width="100" height="28" rx="4" fill="#94A3B8" opacity="0.6" />
          <line x1="150" y1="198" x2="250" y2="198" stroke="#E2E8F0" strokeWidth="3" strokeDasharray="5 5" />
          <line x1="150" y1="212" x2="230" y2="212" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
          <line x1="150" y1="225" x2="240" y2="225" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
          <line x1="150" y1="238" x2="200" y2="238" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Floating element 1: Left photo print card (Palm / nature artwork) */}
        <g filter="drop-shadow(0px 6px 12px rgba(0,0,0,0.08))">
          <rect x="80" y="190" width="65" height="90" rx="6" fill="#A5B4FC" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M80 240 Q105 210 120 250 T145 235 L145 280 L80 280 Z" fill="#FDE047" />
          <circle cx="100" cy="215" r="7" fill="#FFFFFF" opacity="0.8" />
          {/* green palm leaves */}
          <path d="M98 275 Q105 250 115 240" stroke="#15803D" strokeWidth="3" strokeLinecap="round" />
          <path d="M102 258 Q115 252 120 260" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
          <path d="M100 265 Q90 255 86 260" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Floating element 2: Pie chart card */}
        <g filter="drop-shadow(0px 4px 8px rgba(0,0,0,0.06))">
          <circle cx="165" cy="290" r="18" fill="#E2E8F0" />
          {/* slices */}
          <path d="M165 290 L165 272 A18 18 0 0 1 183 290 Z" fill="#3B82F6" />
          <path d="M165 290 L183 290 A18 18 0 0 1 155 306 Z" fill="#EAB308" />
          <path d="M165 290 L155 306 A18 18 0 0 1 165 272 Z" fill="#F8FAFC" />
        </g>

        {/* Floating element 3: Chart report card */}
        <g filter="drop-shadow(0px 4px 8px rgba(0,0,0,0.06))">
          <rect x="195" y="278" width="48" height="34" rx="4" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
          <path d="M200 304 L208 296 L218 300 L230 288 L238 294" stroke="#F59E0B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M200 304 L208 296 L218 300 L230 288 L238 294 L238 308 L200 308 Z" fill="#FEF3C7" opacity="0.6" />
        </g>

        {/* Floating element 4: ID Card badge */}
        <g filter="drop-shadow(0px 4px 8px rgba(0,0,0,0.06))">
          <rect x="255" y="278" width="46" height="32" rx="4" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
          <rect x="255" y="278" width="46" height="6" fill="#F59E0B" rx="2" />
          <circle cx="266" cy="295" r="5" fill="#CBD5E1" />
          <line x1="275" y1="292" x2="295" y2="292" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
          <line x1="275" y1="298" x2="290" y2="298" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Floating element 5: Document icon right side */}
        <g filter="drop-shadow(0px 4px 8px rgba(0,0,0,0.06))">
          <rect x="278" y="210" width="30" height="38" rx="4" fill="#93C5FD" opacity="0.7" />
          <line x1="284" y1="218" x2="302" y2="218" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <line x1="284" y1="225" x2="300" y2="225" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <line x1="284" y1="232" x2="296" y2="232" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <line x1="284" y1="239" x2="294" y2="239" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
