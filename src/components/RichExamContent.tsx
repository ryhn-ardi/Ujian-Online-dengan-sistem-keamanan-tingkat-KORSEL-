import React, { useState } from 'react';
import katex from 'katex';
import { ZoomIn, ZoomOut, X, Maximize2, RotateCcw, ImageIcon } from 'lucide-react';

interface RichExamContentProps {
  text: string;
  imageUrl?: string;
  isReadingPassage?: boolean;
  className?: string;
  imageAlt?: string;
  zoomableImage?: boolean;
}

/**
 * Intelligent helper to convert raw math text or LaTeX into KaTeX rendered HTML.
 * Handles:
 * - Full LaTeX blocks: $$...$$ and $...$
 * - LaTeX shortcuts without dollars: \frac{a}{b}, \sqrt{x}, \pi
 * - Common SMP Math notations: x^2, r^2, cm^2, cm^3, 1/2, π, ², ³, °, etc.
 */
export function formatMathSegment(raw: string): string {
  if (!raw) return '';

  try {
    // 1. If wrapped in $$...$$ (display math)
    if (raw.startsWith('$$') && raw.endsWith('$$') && raw.length >= 4) {
      const math = raw.slice(2, -2).trim();
      return katex.renderToString(math, { displayMode: true, throwOnError: false });
    }

    // 2. If wrapped in $...$ (inline math)
    if (raw.startsWith('$') && raw.endsWith('$') && raw.length >= 2) {
      const math = raw.slice(1, -1).trim();
      return katex.renderToString(math, { displayMode: false, throwOnError: false });
    }

    // 3. If contains raw LaTeX math command without $ (e.g. \frac{1}{2}, \sqrt{25}, \pi, \pm, \times)
    if (
      raw.includes('\\frac') ||
      raw.includes('\\sqrt') ||
      raw.includes('\\pi') ||
      raw.includes('\\alpha') ||
      raw.includes('\\beta') ||
      raw.includes('\\pm') ||
      raw.includes('\\times') ||
      raw.includes('\\div') ||
      raw.includes('\\left') ||
      raw.includes('\\sum') ||
      raw.includes('\\int') ||
      raw.includes('\\le') ||
      raw.includes('\\ge') ||
      raw.includes('\\ne') ||
      raw.includes('^{') ||
      raw.includes('_{')
    ) {
      return katex.renderToString(raw, { displayMode: false, throwOnError: false });
    }
  } catch (err) {
    console.warn('KaTeX render error:', err);
  }

  return raw;
}

/**
 * Parses inline string into elements, detecting LaTeX math ($...$ or $$...$$)
 * and SMP shorthand superscripts (e.g. x^2, cm^2, 5^3).
 */
export function parseInlineMath(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match $$...$$ or $...$
  const regex = /(\$\$[\s\S]+?\$\$|\$[^\$]+?\$)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('$')) {
      const html = formatMathSegment(part);
      return (
        <span
          key={index}
          className="inline-math font-serif"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    // Check if the plain text has raw \frac{...}{...} or \sqrt{...}
    if (part.includes('\\frac') || part.includes('\\sqrt')) {
      const html = formatMathSegment(part);
      return (
        <span
          key={index}
          className="inline-math font-serif"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    // Handle common SMP power notation like x^2, r^2, cm^2, 10^5 in normal text
    const powerRegex = /([a-zA-Z0-9\)])\^([0-9a-zA-Z\+\-]+)/g;
    if (powerRegex.test(part)) {
      const subParts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      const re = /([a-zA-Z0-9\)])\^([0-9a-zA-Z\+\-]+)/g;

      while ((match = re.exec(part)) !== null) {
        if (match.index > lastIndex) {
          subParts.push(part.substring(lastIndex, match.index));
        }
        subParts.push(
          <span key={`p-${match.index}`} className="inline-flex items-baseline font-mono text-indigo-900 font-semibold">
            {match[1]}
            <sup className="text-[0.75em] font-bold text-indigo-600 top-[-0.4em] relative">{match[2]}</sup>
          </span>
        );
        lastIndex = re.lastIndex;
      }
      if (lastIndex < part.length) {
        subParts.push(part.substring(lastIndex));
      }
      return <React.Fragment key={index}>{subParts}</React.Fragment>;
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Component to display exam questions and options with support for:
 * 1. Mathematical equations and SMP symbols (phi, kuadrat, kubik, pecahan, dll)
 * 2. Formatted paragraphs with Indonesian textbook indentation (menjorok ke dalam)
 * 3. Generous line-height (jarak antar baris) for long reading passages
 * 4. Zoomable question diagram / illustration images
 */
export const RichExamContent: React.FC<RichExamContentProps> = ({
  text,
  imageUrl,
  isReadingPassage = false,
  className = '',
  imageAlt = 'Gambar Soal Ujian',
  zoomableImage = true,
}) => {
  const [showImageModal, setShowImageModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Normalize newlines and break into paragraphs
  const rawParagraphs = (text || '').split(/\r?\n\r?\n|\r?\n/);
  const paragraphs = rawParagraphs.map((p) => p.trim()).filter((p) => p.length > 0);

  // Auto-detect reading passage if text has multiple paragraphs or is long
  const isMultiParagraph = paragraphs.length > 1;
  const isLongPassage = isReadingPassage || (isMultiParagraph && text.length > 180);

  return (
    <div className={`rich-exam-content ${className}`}>
      {/* 1. Long Reading Passage Container (Bahasa Indonesia / Literasi Wacana) */}
      {isLongPassage ? (
        <div className="my-3 p-5 sm:p-6 bg-amber-50/30 rounded-2xl border border-amber-200/60 shadow-xs relative">
          <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-amber-200/50 text-amber-900 font-bold text-xs uppercase font-mono tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Wacana / Teks Bacaan</span>
          </div>

          <div className="space-y-4 text-slate-800 text-sm sm:text-base leading-[1.85] text-justify tracking-normal">
            {paragraphs.map((p, idx) => (
              <p
                key={idx}
                className="indent-8 sm:indent-10 font-normal selection:bg-amber-100"
              >
                {parseInlineMath(p)}
              </p>
            ))}
          </div>
        </div>
      ) : (
        /* Standard Question Paragraphs */
        <div className="space-y-3 text-slate-800 leading-relaxed">
          {paragraphs.map((p, idx) => (
            <p
              key={idx}
              className={`${
                isMultiParagraph ? 'indent-6 sm:indent-8 mb-2 leading-[1.8] text-justify' : 'leading-relaxed'
              }`}
            >
              {parseInlineMath(p)}
            </p>
          ))}
        </div>
      )}

      {/* 2. Question Illustration / Diagram / Graph with Click-to-Zoom */}
      {imageUrl && (
        <div className="mt-4 mb-2">
          <div className="inline-block max-w-full">
            <div className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs hover:shadow-md transition">
              <img
                src={imageUrl}
                alt={imageAlt}
                className="max-h-72 sm:max-h-96 w-auto max-w-full object-contain mx-auto cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                onClick={() => zoomableImage && setShowImageModal(true)}
                loading="lazy"
              />

              {zoomableImage && (
                <div
                  onClick={() => setShowImageModal(true)}
                  className="absolute bottom-2 right-2 px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-950 backdrop-blur-xs text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Perbesar Gambar</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <ImageIcon className="w-3 h-3 text-slate-400" />
              <span>Klik gambar untuk memperbesar detail (diagram / grafik)</span>
            </p>
          </div>
        </div>
      )}

      {/* 3. Fullscreen / Zoom Lightbox Modal */}
      {showImageModal && imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="relative max-w-5xl w-full h-[90vh] bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 text-white">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm tracking-wide">Pratinjau Gambar / Diagram Soal</span>
                <span className="text-xs text-slate-400 font-mono ml-2">
                  {Math.round(zoomLevel * 100)}%
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition"
                  title="Perbesar (Zoom In)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition"
                  title="Perkecil (Zoom Out)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition"
                  title="Kembalikan Ukuran Asli (100%)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImageModal(false);
                    setZoomLevel(1);
                  }}
                  className="p-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl transition ml-2"
                  title="Tutup (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image Canvas with Scroll */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-slate-950">
              <img
                src={imageUrl}
                alt={imageAlt}
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-w-full max-h-full object-contain transition-transform duration-150 rounded-xl shadow-2xl cursor-grab"
              />
            </div>

            {/* Bottom info */}
            <div className="px-6 py-2.5 bg-slate-900 border-t border-slate-800 text-center text-xs text-slate-400">
              Gunakan tombol pembesar di kanan atas untuk melihat detail angka atau koordinat grafik secara jernih.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
