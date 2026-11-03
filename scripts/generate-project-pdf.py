"""Genera el PDF de lectura del documento principal, sin crear una segunda fuente editorial.
Requiere reportlab. Ejecutar desde cualquier carpeta: python scripts/generate-project-pdf.py.
"""
from pathlib import Path
from hashlib import sha256
from html import escape
import re
import textwrap
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, XPreformatted
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/PROYECTO_DUVARRET.md'
OUTPUT = ROOT / 'docs/PROYECTO_DUVARRET.pdf'
FONT_PATHS = [Path('C:/Windows/Fonts'), Path('/usr/share/fonts/truetype/dejavu')]
for directory in FONT_PATHS:
    if (directory / 'arial.ttf').exists():
        regular, bold, mono = directory/'arial.ttf', directory/'arialbd.ttf', directory/'consola.ttf'
        break
    if (directory / 'DejaVuSans.ttf').exists():
        regular, bold, mono = directory/'DejaVuSans.ttf', directory/'DejaVuSans-Bold.ttf', directory/'DejaVuSansMono.ttf'
        break
else:
    raise SystemExit('Se necesitan Arial/Consolas o DejaVu Sans/Mono para el PDF Unicode.')
for name, path in [('Body',regular),('Strong',bold),('Code',mono)]:
    pdfmetrics.registerFont(TTFont(name,str(path)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Strong',italic='Body',boldItalic='Strong')
INK, MUTED, COPPER = colors.HexColor('#20303c'), colors.HexColor('#596875'), colors.HexColor('#8c522b')
WIDTH, HEIGHT = A4
CONTENT = WIDTH-104
styles = {
    'body': ParagraphStyle('body',fontName='Body',fontSize=10,leading=15,textColor=INK,spaceAfter=8),
    'h1': ParagraphStyle('h1',fontName='Strong',fontSize=17,leading=22,textColor=COPPER,spaceBefore=19,spaceAfter=10,keepWithNext=True),
    'h2': ParagraphStyle('h2',fontName='Strong',fontSize=12,leading=17,textColor=INK,spaceBefore=12,spaceAfter=6,keepWithNext=True),
    'bullet': ParagraphStyle('bullet',fontName='Body',fontSize=10,leading=15,textColor=INK,leftIndent=12,firstLineIndent=-10,spaceAfter=5),
    'cell': ParagraphStyle('cell',fontName='Body',fontSize=8.6,leading=12,textColor=INK,splitLongWords=True),
    'code': ParagraphStyle('code',fontName='Code',fontSize=7.3,leading=10,textColor=INK,backColor=colors.HexColor('#f3f1ed'),borderPadding=8,spaceBefore=5,spaceAfter=12),
    'cover': ParagraphStyle('cover',fontName='Strong',fontSize=38,leading=44,textColor=INK,spaceAfter=15),
    'subtitle': ParagraphStyle('subtitle',fontName='Body',fontSize=19,leading=27,textColor=COPPER,spaceAfter=20),
}

def plain(s):
    return s.replace('\u2013','-').replace('\u2014','-').replace('\u2011','-').replace('\xa0',' ')

def inline(s):
    s = re.sub(r'\[([^\]]+)\]\([^)]+\)',r'\1',s)
    s = escape(plain(s))
    s = re.sub(r'`([^`]+)`',r'<font name="Code" size="8.6">\1</font>',s)
    return re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)

class Document(BaseDocTemplate):
    def beforeDocument(self):
        self.section_index = 0
    def afterFlowable(self,flowable):
        if isinstance(flowable,Paragraph) and flowable.style.name == 'h1':
            key = f'section-{self.section_index}'
            self.section_index += 1
            text = flowable.getPlainText()
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text,key,0)
            self.notify('TOCEntry',(0,text,self.page,key))

def page_frame(canvas,document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor('#d9d1c7'))
    canvas.setLineWidth(.6)
    canvas.line(52,HEIGHT-39,WIDTH-52,HEIGHT-39)
    canvas.setFont('Body',8)
    canvas.setFillColor(MUTED)
    canvas.drawString(52,HEIGHT-30,'DUVARRET  /  DOCUMENTO DEL PROYECTO')
    canvas.drawString(52,31,'Studio 0.2.0  |  3 de noviembre de 2026')
    canvas.drawRightString(WIDTH-52,31,str(document.page))
    canvas.restoreState()

raw = SOURCE.read_text(encoding='utf-8-sig')
source_hash = sha256(SOURCE.read_bytes()).hexdigest()
doc = Document(str(OUTPUT),pagesize=A4,leftMargin=52,rightMargin=52,topMargin=57,bottomMargin=51,
               title='Duvarret - Documento del proyecto',author='Proyecto Duvarret',
               subject=f'Fuente: PROYECTO_DUVARRET.md; SHA256 {source_hash}')
doc.addPageTemplates(PageTemplate(id='pages',frames=Frame(52,51,CONTENT,HEIGHT-108,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0),onPage=page_frame))
flow = [Spacer(1,100),Paragraph('Duvarret',styles['cover']),Paragraph('Documento del proyecto',styles['subtitle']),
        Paragraph('Qué es, para qué sirve, cómo se utiliza y cómo está construido.',styles['body']),Spacer(1,25),
        Paragraph('Un estudio de autoría para convertir textos en experiencias literarias interactivas.',styles['body']),
        Spacer(1,25),Paragraph('<b>Edición de referencia: Studio 0.2.0</b><br/>Revisión: 3 de noviembre de 2026',styles['body']),
        Spacer(1,26),Paragraph('Descripción del producto, guía de uso y arquitectura técnica. Las posibilidades actuales y los trabajos pendientes se presentan por separado.',styles['body']),PageBreak(),
        Paragraph('Contenido',ParagraphStyle('toc-title',parent=styles['h1'])),Spacer(1,8)]
toc = TableOfContents()
toc.levelStyles=[ParagraphStyle('toc',fontName='Body',fontSize=10,leading=17,textColor=INK,leftIndent=0,firstLineIndent=0,spaceBefore=5)]
flow += [toc,PageBreak()]
lines = raw.splitlines()
i = next(i for i,s in enumerate(lines) if s.startswith('## 1.'))
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1; continue
    if line.startswith('```'):
        block=[];i+=1
        while i<len(lines) and not lines[i].startswith('```'):
            block.extend(textwrap.wrap(plain(lines[i]),width=104,replace_whitespace=False,drop_whitespace=False) or [''])
            i+=1
        flow.append(XPreformatted(escape('\n'.join(block)),styles['code']));i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            values=[s.strip() for s in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?',s) for s in values):
                rows.append([Paragraph(inline(s),styles['cell']) for s in values])
            i+=1
        columns=len(rows[0]); widths=[CONTENT*.24]+[CONTENT*.76/(columns-1)]*(columns-1) if columns>1 else [CONTENT]
        table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#ece6dd')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.7,colors.HexColor('#bba68f')),('LINEBELOW',(0,1),(-1,-1),.35,colors.HexColor('#ddd9d3')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
        flow += [table,Spacer(1,10)];continue
    if line.startswith('### '):
        flow.append(Paragraph(inline(line[4:]),styles['h2']));i+=1;continue
    if line.startswith('## '):
        flow.append(Paragraph(inline(line[3:]),styles['h1']));i+=1;continue
    if line.startswith('- '):
        flow.append(Paragraph('- '+inline(line[2:]),styles['bullet']));i+=1;continue
    paragraph=[line];i+=1
    while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','- ','|','```')):
        paragraph.append(lines[i].strip());i+=1
    flow.append(Paragraph(inline(' '.join(paragraph)),styles['body']))
doc.multiBuild(flow)
print(f'Generado {OUTPUT} | fuente SHA256 {source_hash}')
