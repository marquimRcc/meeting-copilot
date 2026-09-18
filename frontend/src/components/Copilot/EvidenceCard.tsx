import React, { useState } from 'react';
import { EvidenceMatch } from '@/copilot';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface EvidenceCardProps {
  evidence: EvidenceMatch;
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({ evidence }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-indigo-100 bg-indigo-50/40 rounded-lg p-2.5 text-xs transition-colors hover:bg-indigo-50/70">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-1.5 font-medium text-indigo-950 truncate">
          <BookOpen size={13} className="text-indigo-600 shrink-0" />
          <span className="truncate">{evidence.title}</span>
          <span className="text-indigo-400 font-normal">§{evidence.paragraph}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0 ml-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
            {Math.round(evidence.score * 100)}% relevância
          </span>
          {expanded ? <ChevronUp size={14} className="text-indigo-500" /> : <ChevronDown size={14} className="text-indigo-500" />}
        </div>
      </div>

      {expanded ? (
        <p className="mt-2 text-gray-700 leading-relaxed whitespace-pre-wrap border-t border-indigo-100 pt-2 text-[11px]">
          {evidence.text}
        </p>
      ) : (
        <p className="mt-1 text-gray-500 line-clamp-2 text-[11px]">
          {evidence.text}
        </p>
      )}
    </div>
  );
};
