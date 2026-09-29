/**
 * OMML (Office Math Markup Language) to LaTeX Converter
 * Translates Microsoft Word Equation XML (<m:oMath>, <m:oMathPara>) into standard LaTeX ($...$, $$...$$)
 * capable of being beautifully rendered by KaTeX in the browser.
 */

/**
 * Cleans and unescapes basic XML entities.
 */
function cleanXmlText(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Maps common OMML special characters or Unicode math symbols to LaTeX equivalents.
 */
function mapMathSymbolsToLatex(text: string): string {
  const symbolMap: Record<string, string> = {
    '±': '\\pm ',
    '×': '\\times ',
    '÷': '\\div ',
    '≠': '\\ne ',
    '≤': '\\le ',
    '≥': '\\ge ',
    '≈': '\\approx ',
    '≡': '\\equiv ',
    '∞': '\\infty ',
    'π': '\\pi ',
    'Π': '\\Pi ',
    'α': '\\alpha ',
    'β': '\\beta ',
    'γ': '\\gamma ',
    'Γ': '\\Gamma ',
    'δ': '\\delta ',
    'Δ': '\\Delta ',
    'θ': '\\theta ',
    'Θ': '\\Theta ',
    'λ': '\\lambda ',
    'Λ': '\\Lambda ',
    'μ': '\\mu ',
    'σ': '\\sigma ',
    'Σ': '\\sum ',
    'ω': '\\omega ',
    'Ω': '\\Omega ',
    '√': '\\sqrt',
    '∫': '\\int ',
    '∂': '\\partial ',
    '∇': '\\nabla ',
    '∈': '\\in ',
    '∉': '\\notin ',
    '⊂': '\\subset ',
    '⊆': '\\subseteq ',
    '∪': '\\cup ',
    '∩': '\\cap ',
    '°': '^\\circ ',
    '∠': '\\angle ',
    '⊥': '\\perp ',
    '→': '\\rightarrow ',
    '←': '\\leftarrow ',
    '↔': '\\leftrightarrow ',
    '⇒': '\\Rightarrow ',
    '⇔': '\\Leftrightarrow ',
    '·': '\\cdot ',
    '•': '\\cdot ',
    '%': '\\% ',
  };

  let res = text;
  for (const [sym, lat] of Object.entries(symbolMap)) {
    if (res.includes(sym)) {
      res = res.split(sym).join(lat);
    }
  }
  return res;
}

/**
 * Recursively converts an OMML DOM Node into LaTeX string.
 */
function convertNode(node: Node): string {
  if (node.nodeType === 3) {
    // Text node
    return mapMathSymbolsToLatex(cleanXmlText(node.nodeValue || ''));
  }

  if (node.nodeType !== 1) return '';

  const el = node as Element;
  const tag = el.localName || el.nodeName.split(':').pop() || '';

  switch (tag) {
    case 'oMath':
    case 'oMathPara':
    case 'e': // Element container inside OMML tags
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'lim':
    case 'deg':
    case 'fName':
    case 'mr': // Matrix row
    case 'mc': // Matrix column
      return convertChildren(el);

    case 'r': // Math run
      return convertChildren(el);

    case 't': { // Math text
      const raw = el.textContent || '';
      return mapMathSymbolsToLatex(cleanXmlText(raw));
    }

    case 'f': { // Fraction: <m:f> <m:num>...</m:num> <m:den>...</m:den> </m:f>
      const numEl = getChildByLocalName(el, 'num');
      const denEl = getChildByLocalName(el, 'den');
      const num = numEl ? convertNode(numEl).trim() : '1';
      const den = denEl ? convertNode(denEl).trim() : '1';
      return `\\frac{${num}}{${den}}`;
    }

    case 'rad': { // Radical / Root: <m:rad> <m:deg>...</m:deg> <m:e>...</m:e> </m:rad>
      const degEl = getChildByLocalName(el, 'deg');
      const eEl = getChildByLocalName(el, 'e');
      const deg = degEl ? convertNode(degEl).trim() : '';
      const content = eEl ? convertNode(eEl).trim() : '';
      if (deg && deg !== '2') {
        return `\\sqrt[${deg}]{${content}}`;
      }
      return `\\sqrt{${content}}`;
    }

    case 'sSup': { // Superscript / Power: <m:sSup> <m:e>...</m:e> <m:sup>...</m:sup> </m:sSup>
      const baseEl = getChildByLocalName(el, 'e');
      const supEl = getChildByLocalName(el, 'sup');
      const base = baseEl ? convertNode(baseEl).trim() : '';
      const sup = supEl ? convertNode(supEl).trim() : '';
      return `{${base}}^{${sup}}`;
    }

    case 'sSub': { // Subscript: <m:sSub> <m:e>...</m:e> <m:sub>...</m:sub> </m:sSub>
      const baseEl = getChildByLocalName(el, 'e');
      const subEl = getChildByLocalName(el, 'sub');
      const base = baseEl ? convertNode(baseEl).trim() : '';
      const sub = subEl ? convertNode(subEl).trim() : '';
      return `{${base}}_{${sub}}`;
    }

    case 'sSubSup': { // Subscript and Superscript: <m:sSubSup>
      const baseEl = getChildByLocalName(el, 'e');
      const subEl = getChildByLocalName(el, 'sub');
      const supEl = getChildByLocalName(el, 'sup');
      const base = baseEl ? convertNode(baseEl).trim() : '';
      const sub = subEl ? convertNode(subEl).trim() : '';
      const sup = supEl ? convertNode(supEl).trim() : '';
      return `{${base}}_{${sub}}^{${sup}}`;
    }

    case 'd': { // Delimiter / Parentheses: <m:d> <m:dPr>...</m:dPr> <m:e>...</m:e> </m:d>
      const eEl = getChildByLocalName(el, 'e');
      const dPr = getChildByLocalName(el, 'dPr');
      let begChr = '(';
      let endChr = ')';
      if (dPr) {
        const beg = getChildByLocalName(dPr, 'begChr')?.getAttribute('m:val');
        const end = getChildByLocalName(dPr, 'endChr')?.getAttribute('m:val');
        if (beg !== null && beg !== undefined) begChr = beg;
        if (end !== null && end !== undefined) endChr = end;
      }
      const inner = eEl ? convertNode(eEl).trim() : convertChildren(el).trim();
      const openLat = begChr === '[' ? '\\left[' : begChr === '{' ? '\\left\\{' : begChr === '|' ? '\\left|' : begChr ? `\\left${begChr}` : '\\left.';
      const closeLat = endChr === ']' ? '\\right]' : endChr === '}' ? '\\right\\}' : endChr === '|' ? '\\right|' : endChr ? `\\right${endChr}` : '\\right.';
      return `${openLat} ${inner} ${closeLat}`;
    }

    case 'nary': { // N-ary operator: sum, int, prod
      const naryPr = getChildByLocalName(el, 'naryPr');
      const chr = getChildByLocalName(naryPr || el, 'chr')?.getAttribute('m:val') || '∑';
      const subEl = getChildByLocalName(el, 'sub');
      const supEl = getChildByLocalName(el, 'sup');
      const eEl = getChildByLocalName(el, 'e');

      let op = '\\sum';
      if (chr === '∫') op = '\\int';
      else if (chr === '∏') op = '\\prod';

      const sub = subEl ? convertNode(subEl).trim() : '';
      const sup = supEl ? convertNode(supEl).trim() : '';
      const expr = eEl ? convertNode(eEl).trim() : '';

      let limits = '';
      if (sub && sup) limits = `_{${sub}}^{${sup}}`;
      else if (sub) limits = `_{${sub}}`;
      else if (sup) limits = `^{${sup}}`;

      return `${op}${limits} {${expr}}`;
    }

    case 'func': { // Function: <m:func> <m:fName>...</m:fName> <m:e>...</m:e> </m:func>
      const nameEl = getChildByLocalName(el, 'fName');
      const eEl = getChildByLocalName(el, 'e');
      const fn = nameEl ? convertNode(nameEl).trim() : 'f';
      const arg = eEl ? convertNode(eEl).trim() : '';
      return `\\${fn}\\left(${arg}\\right)`;
    }

    case 'm': { // Matrix: <m:m>
      const rows = getChildrenByLocalName(el, 'mr');
      const rowStrings = rows.map(r => {
        const cols = getChildrenByLocalName(r, 'e');
        return cols.map(c => convertNode(c).trim()).join(' & ');
      });
      return `\\begin{matrix} ${rowStrings.join(' \\\\ ')} \\end{matrix}`;
    }

    case 'bar': { // Overline / Underline
      const eEl = getChildByLocalName(el, 'e');
      const inner = eEl ? convertNode(eEl).trim() : '';
      return `\\overline{${inner}}`;
    }

    case 'acc': { // Accent, e.g. vector arrow, hat
      const eEl = getChildByLocalName(el, 'e');
      const inner = eEl ? convertNode(eEl).trim() : '';
      return `\\vec{${inner}}`;
    }

    default:
      return convertChildren(el);
  }
}

function convertChildren(el: Element): string {
  let result = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    result += convertNode(el.childNodes[i]);
  }
  return result;
}

function getChildByLocalName(parent: Element | null, localName: string): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const name = child.localName || child.nodeName.split(':').pop();
    if (name?.toLowerCase() === localName.toLowerCase()) {
      return child;
    }
  }
  return null;
}

function getChildrenByLocalName(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const name = child.localName || child.nodeName.split(':').pop();
    if (name?.toLowerCase() === localName.toLowerCase()) {
      result.push(child);
    }
  }
  return result;
}

/**
 * Converts a raw OMML XML string (<m:oMath>...</m:oMath>) into a LaTeX expression.
 */
export function convertOmmlStringToLatex(ommlXml: string): string {
  try {
    let xml = ommlXml;
    if (!xml.includes('xmlns:m=')) {
      xml = `<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${xml}</root>`;
    } else {
      xml = `<root>${xml}</root>`;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return fallbackRegexOmmlToLatex(ommlXml);
    }

    const oMath = doc.querySelector('oMath, oMathPara') || doc.documentElement;
    const latex = convertNode(oMath).trim();
    return latex || fallbackRegexOmmlToLatex(ommlXml);
  } catch {
    return fallbackRegexOmmlToLatex(ommlXml);
  }
}

/**
 * Fallback regex-based OMML extraction when DOM parser is not suitable.
 */
export function fallbackRegexOmmlToLatex(ommlXml: string): string {
  let res = ommlXml;

  // Fraction: <m:f>...<m:num>...</m:num>...<m:den>...</m:den>...</m:f>
  res = res.replace(/<m:f\b[^>]*>[\s\S]*?<m:num\b[^>]*>([\s\S]*?)<\/m:num>[\s\S]*?<m:den\b[^>]*>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/gi, (_, numXml, denXml) => {
    const num = extractTexts(numXml);
    const den = extractTexts(denXml);
    return `\\frac{${num || '1'}}{${den || '1'}}`;
  });

  // Radicals: <m:rad>...<m:e>...</m:e>
  res = res.replace(/<m:rad\b[^>]*>[\s\S]*?<m:deg\b[^>]*>([\s\S]*?)<\/m:deg>[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/gi, (_, degXml, eXml) => {
    const deg = extractTexts(degXml);
    const e = extractTexts(eXml);
    return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
  });

  res = res.replace(/<m:rad\b[^>]*>[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/gi, (_, eXml) => {
    const e = extractTexts(eXml);
    return `\\sqrt{${e}}`;
  });

  // Superscript: <m:sSup>...<m:e>...</m:e>...<m:sup>...</m:sup>
  res = res.replace(/<m:sSup\b[^>]*>[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/gi, (_, eXml, supXml) => {
    return `{${extractTexts(eXml)}}^{${extractTexts(supXml)}}`;
  });

  // Subscript: <m:sSub>...<m:e>...</m:e>...<m:sub>...</m:sub>
  res = res.replace(/<m:sSub\b[^>]*>[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/gi, (_, eXml, subXml) => {
    return `{${extractTexts(eXml)}}_{${extractTexts(subXml)}}`;
  });

  // Extract all remaining <m:t> texts
  const parts: string[] = [];
  const textRegex = /<m:t\b[^>]*>(.*?)<\/m:t>/gi;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(res)) !== null) {
    parts.push(match[1]);
  }

  if (parts.length > 0) {
    return mapMathSymbolsToLatex(cleanXmlText(parts.join(' ')));
  }

  // Final fallback: strip all tags
  const stripped = res.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return mapMathSymbolsToLatex(cleanXmlText(stripped));
}

function extractTexts(xml: string): string {
  const parts: string[] = [];
  const re = /<m:t\b[^>]*>(.*?)<\/m:t>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(cleanXmlText(m[1]));
  }
  return mapMathSymbolsToLatex(parts.join(' ').trim());
}

/**
 * Pre-processes the raw Word document.xml string from docx.
 * Converts every <m:oMathPara> or <m:oMath> into a Word run containing LaTeX ($...$ or $$...$$).
 * This ensures Mammoth and any subsequent HTML processor will retain pristine LaTeX math formulas!
 */
export function injectLatexIntoWordDocumentXml(documentXml: string): { xml: string; mathCount: number } {
  let mathCount = 0;

  // Process Display Math paragraphs first (<m:oMathPara>)
  let processed = documentXml.replace(/<m:oMathPara\b[^>]*>([\s\S]*?)<\/m:oMathPara>/gi, (fullMatch, paraInner) => {
    mathCount++;
    const latex = convertOmmlStringToLatex(paraInner).trim();
    if (!latex) return fullMatch;
    // Return Word run with display math
    return `<w:r><w:rPr><w:b/><w:color w:val="3730A3"/></w:rPr><w:t xml:space="preserve"> $$ ${escapeXml(latex)} $$ </w:t></w:r>`;
  });

  // Process Inline Math (<m:oMath>)
  processed = processed.replace(/<m:oMath\b[^>]*>([\s\S]*?)<\/m:oMath>/gi, (fullMatch, mathInner) => {
    mathCount++;
    const latex = convertOmmlStringToLatex(mathInner).trim();
    if (!latex) return fullMatch;
    // Return Word run with inline math
    return `<w:r><w:rPr><w:color w:val="3730A3"/></w:rPr><w:t xml:space="preserve"> $ ${escapeXml(latex)} $ </w:t></w:r>`;
  });

  return { xml: processed, mathCount };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
