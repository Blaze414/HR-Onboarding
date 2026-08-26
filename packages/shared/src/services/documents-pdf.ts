import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Making the documents real.
 *
 * Every document in this workspace used to be a row pointing at a storage path
 * with nothing behind it. That is fine until somebody clicks Preview, and then
 * the whole thing reads as a mock-up: the access log records a read of nothing,
 * the retention rule protects nothing, and a pay slip is a timestamp rather
 * than something an employee can hand to a bank.
 *
 * These build actual PDFs. Deliberately plain — a pay slip is read once, for
 * two numbers, usually on a phone.
 */

const INK = rgb(0.17, 0.16, 0.13);
const MUTED = rgb(0.48, 0.46, 0.42);
const RULE = rgb(0.85, 0.83, 0.79);

export interface PdfSection {
  heading?: string;
  /** Label/value pairs, laid out as a definition list. */
  rows?: [string, string][];
  /** Free paragraphs. */
  paragraphs?: string[];
}

export interface PdfInput {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  footer?: string;
}

/** A4 at 72dpi, which is what pdf-lib counts in. */
const PAGE = { width: 595, height: 842 };
const MARGIN = 56;

export async function buildPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  /** Start a new page when the next block would run off this one. */
  const room = (needed: number) => {
    if (y - needed > MARGIN) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };

  const write = (text: string, size: number, font = body, colour = INK) => {
    page.drawText(text, { x: MARGIN, y, size, font, color: colour });
    y -= size + 6;
  };

  /*
   * Helvetica has no glyph for an em dash or curly quotes in the standard
   * encoding, and pdf-lib throws rather than dropping them. Substituting is
   * better than a crash on a document somebody needs.
   */
  const safe = (text: string) => text
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    // Anything else outside WinAnsi becomes a question mark rather than an error.
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

  /** Greedy wrap. Enough for a document nobody typesets twice. */
  const wrap = (text: string, size: number, font = body): string[] => {
    const max = PAGE.width - MARGIN * 2;
    const out: string[] = [];
    let line = '';
    for (const word of safe(text).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
    return out;
  };

  write(safe(input.title), 22, bold);
  if (input.subtitle) {
    write(safe(input.subtitle), 11, body, MUTED);
  }
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y },
    thickness: 1, color: RULE,
  });
  y -= 22;

  for (const section of input.sections) {
    room(60);
    if (section.heading) write(safe(section.heading), 13, bold);

    for (const [label, value] of section.rows ?? []) {
      room(20);
      page.drawText(safe(label), { x: MARGIN, y, size: 10, font: body, color: MUTED });
      page.drawText(safe(value), { x: MARGIN + 190, y, size: 11, font: bold, color: INK });
      y -= 20;
    }

    for (const paragraph of section.paragraphs ?? []) {
      for (const line of wrap(paragraph, 10.5)) {
        room(18);
        write(line, 10.5);
      }
      y -= 6;
    }
    y -= 10;
  }

  if (input.footer) {
    for (const line of wrap(input.footer, 8.5)) {
      room(14);
      write(line, 8.5, body, MUTED);
    }
  }

  return pdf.save();
}
