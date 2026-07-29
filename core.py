#!/usr/bin/env python3
"""
Coeur du traitement PDF (aucune dependance a Flask).

  0. Assemblage : plusieurs PDF sont fusionnes en un seul document de travail.
  1. Analyse : detection des pages VIDES en apprenant le "gabarit" repete
     (bandeaux, logos, filigrane) comme mediane pixel par pixel des pages.
  2. Imposition : 2 pages paysage par feuille portrait, sans deformation.
  3. Remplacement de la premiere page par un PDF ou une image.
"""

import io
import os

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

# ------------------------- reglages d'analyse -------------------------
DETECT_DPI = 100          # resolution de rendu pour l'analyse
DETECT_MAX_WIDTH = 600    # les pages sont reduites a cette largeur (analyse rapide)
MIN_PAGES_FOR_TEMPLATE = 3  # en dessous : methode simple (pas de gabarit fiable)
TEXT_PAGE_RATIO = 0.05    # valeur plancher d'une page qui a son propre texte
                          # (bien au-dessus du seuil maximal de l'interface)

# Repli pour les tres petits PDF
SIMPLE_EDGE_CROP = 0.08
SIMPLE_DARK_THRESHOLD = 200

# ------------------------- formats de sortie --------------------------
# largeur x hauteur en points (72 pt = 1 pouce), orientation portrait
PAGE_SIZES = {
    "a4": (595.276, 841.890),
    "letter": (612.0, 792.0),
    "legal": (612.0, 1008.0),
    "a3": (841.890, 1190.551),
    "a5": (419.528, 595.276),
}

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".gif", ".webp")


# ======================================================================
#  Assemblage de plusieurs documents
# ======================================================================
def merge_pdfs(paths):
    """Concatene plusieurs PDF dans l'ordre donne.

    Renvoie (document, segments) ou `segments` decrit, pour chaque fichier
    d'origine, sa position dans le document fusionne :
        [{"pages": 12, "start": 0}, {"pages": 4, "start": 12}, ...]
    Les pages gardent leur format d'origine : l'imposition mesure chaque page
    individuellement, des sources de tailles differentes restent donc correctes.
    """
    out = fitz.open()
    segments = []
    try:
        for path in paths:
            with fitz.open(path) as doc:
                if doc.page_count == 0:
                    raise ValueError("%s ne contient aucune page."
                                     % os.path.basename(path))
                segments.append({"pages": doc.page_count, "start": out.page_count})
                out.insert_pdf(doc)
    except Exception:
        out.close()
        raise
    return out, segments


# ======================================================================
#  Analyse
# ======================================================================
def _gray_array(page):
    """Rend une page en petit tableau numpy niveaux de gris."""
    pix = page.get_pixmap(dpi=DETECT_DPI, colorspace=fitz.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    if img.width > DETECT_MAX_WIDTH:
        new_h = max(1, int(img.height * DETECT_MAX_WIDTH / img.width))
        img = img.resize((DETECT_MAX_WIDTH, new_h))
    return np.asarray(img, dtype=np.int16)


def _simple_ink_ratio(page):
    """Repli : proportion de pixels sombres au centre de la page."""
    if len(page.get_text().strip()) > 3:
        return 1.0
    pix = page.get_pixmap(dpi=DETECT_DPI, colorspace=fitz.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    w, h = img.size
    box = (int(w * SIMPLE_EDGE_CROP), int(h * SIMPLE_EDGE_CROP),
           int(w * (1 - SIMPLE_EDGE_CROP)), int(h * (1 - SIMPLE_EDGE_CROP)))
    interior = img.crop(box)
    dark = sum(interior.histogram()[0:SIMPLE_DARK_THRESHOLD])
    total = interior.width * interior.height
    return (dark / total) if total else 0.0


def _own_text_flags(doc):
    """True pour chaque page qui porte du texte BIEN A ELLE, c'est-a-dire du
    texte selectionnable absent des lignes repetees sur la plupart des pages
    (titre courant, pied de page, mention de copyright...)."""
    from collections import Counter

    per_page, counter = [], Counter()
    for i in range(doc.page_count):
        lines = {ln.strip() for ln in doc[i].get_text().splitlines() if ln.strip()}
        per_page.append(lines)
        counter.update(lines)
    common_cut = max(2, int(doc.page_count * 0.6))
    common = {t for t, c in counter.items() if c >= common_cut}
    return [len("".join(lines - common)) > 3 for lines in per_page]


def ink_ratios(doc, dark_delta=40):
    """Retourne, pour chaque page, la proportion d'encre AJOUTEE par rapport au
    gabarit repete du document. Une page qui ne porte que le design commun
    obtient une valeur proche de 0.

    Les pages qui contiennent du texte propre sont remontees a TEXT_PAGE_RATIO :
    elles ne peuvent jamais etre prises pour des pages vides, meme si leur
    mise en page est identique a celle des autres pages."""
    if doc.page_count == 0:
        return []
    if doc.page_count < MIN_PAGES_FOR_TEMPLATE:
        return [float(_simple_ink_ratio(doc[i])) for i in range(doc.page_count)]

    arrays = [_gray_array(doc[i]) for i in range(doc.page_count)]
    min_h = min(a.shape[0] for a in arrays)
    min_w = min(a.shape[1] for a in arrays)
    stack = np.stack([a[:min_h, :min_w] for a in arrays], axis=0)

    template = np.median(stack, axis=0)                    # le design repete
    writing = (template[None, ...] - stack) > dark_delta   # plus sombre = ecriture
    ratios = [float(r) for r in writing.reshape(stack.shape[0], -1).mean(axis=1)]

    has_text = _own_text_flags(doc)                        # securite pour les PDF textuels
    return [max(r, TEXT_PAGE_RATIO) if t else r for r, t in zip(ratios, has_text)]


def thumbnails(doc, width=170, quality=70, indexes=None):
    """Vignettes JPEG en data-URI, pretes a etre affichees dans le navigateur."""
    out = []
    for i in (range(doc.page_count) if indexes is None else indexes):
        page = doc[i]
        zoom = width / page.rect.width if page.rect.width else 1.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        out.append("data:image/jpeg;base64," + _b64(buf.getvalue()))
    return out


def _b64(data):
    import base64
    return base64.b64encode(data).decode("ascii")


# ======================================================================
#  Imposition
# ======================================================================
def fitted_rect(slot, src_w, src_h):
    """Rectangle centre dans `slot` qui conserve le rapport d'aspect."""
    scale = min(slot.width / src_w, slot.height / src_h)
    new_w, new_h = src_w * scale, src_h * scale
    x0 = slot.x0 + (slot.width - new_w) / 2.0
    y0 = slot.y0 + (slot.height - new_h) / 2.0
    return fitz.Rect(x0, y0, x0 + new_w, y0 + new_h)


def load_replacement(path):
    """Charge la nouvelle premiere page (PDF ou image) en document 1 page."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        doc = fitz.open(path)
        if doc.page_count == 0:
            raise ValueError("Le PDF de remplacement ne contient aucune page.")
        if doc.page_count > 1:
            doc.select([0])
        return doc
    if ext in IMAGE_EXTS:
        img = fitz.open(path)
        pdf_bytes = img.convert_to_pdf()
        img.close()
        return fitz.open("pdf", pdf_bytes)
    raise ValueError("Format non supporte : %s (PDF ou image attendu)" % ext)


def resolve_page_size(size_key, sample_rect, outer_margin, middle_gap, custom=None):
    """Renvoie (largeur, hauteur) de la feuille portrait de sortie.
    'auto' calcule une feuille collee au format source : aucune bande blanche."""
    if size_key == "custom" and custom:
        return float(custom[0]), float(custom[1])
    if size_key == "auto" and sample_rect is not None:
        w = sample_rect.width + 2 * outer_margin
        h = 2 * sample_rect.height + 2 * outer_margin + middle_gap
        return w, h
    return PAGE_SIZES.get(size_key, PAGE_SIZES["a4"])


def get_slots(page_w, page_h, outer_margin, middle_gap):
    """Emplacement haut et bas sur la feuille portrait."""
    top = fitz.Rect(outer_margin, outer_margin,
                    page_w - outer_margin, page_h / 2 - middle_gap / 2)
    bottom = fitz.Rect(outer_margin, page_h / 2 + middle_gap / 2,
                       page_w - outer_margin, page_h - outer_margin)
    return [top, bottom]


def build_document(source_path, replacement_path=None, removed=(), *,
                   page_size="a4", custom_size=None, outer_margin=6.0,
                   middle_gap=6.0, cover_margin=0.0, mode="cover"):
    """Construit le PDF portrait 2-up et renvoie (document, statistiques)."""
    src = fitz.open(source_path)
    repl = load_replacement(replacement_path) if replacement_path else None
    removed = set(int(i) for i in removed)

    kept = [i for i in range(src.page_count) if i not in removed]
    if not kept and repl is None:
        src.close()
        raise ValueError("Aucune page a placer : tout a ete supprime.")

    sample = src[kept[0]].rect if kept else (repl[0].rect if repl else None)
    page_w, page_h = resolve_page_size(page_size, sample, outer_margin,
                                       middle_gap, custom_size)

    out = fitz.open()
    sequence = [(src, i) for i in kept]

    if repl is not None and mode == "cover":
        page = out.new_page(width=page_w, height=page_h)
        full = fitz.Rect(cover_margin, cover_margin,
                         page_w - cover_margin, page_h - cover_margin)
        r = repl[0].rect
        page.show_pdf_page(fitted_rect(full, r.width, r.height), repl, 0)
    elif repl is not None:
        sequence.insert(0, (repl, 0))

    slots = get_slots(page_w, page_h, outer_margin, middle_gap)
    for i in range(0, len(sequence), 2):
        page = out.new_page(width=page_w, height=page_h)
        for slot, (doc, idx) in zip(slots, sequence[i:i + 2]):
            r = doc[idx].rect
            page.show_pdf_page(fitted_rect(slot, r.width, r.height), doc, idx)

    stats = {
        "source_pages": src.page_count,
        "removed_pages": sorted(i + 1 for i in removed),
        "kept_pages": len(kept),
        "output_pages": out.page_count,
        "page_width": round(page_w, 1),
        "page_height": round(page_h, 1),
        "replaced": repl is not None,
    }

    src.close()
    if repl is not None:
        repl.close()
    return out, stats
