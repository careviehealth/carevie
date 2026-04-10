import gc
import io
import os
import re
import cv2
import numpy as np
from PIL import Image
import pdfplumber

os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

PADDLE_AVAILABLE = False
paddle_ocr = None
try:
    from paddleocr import PaddleOCR

    # Use mobile_det to prevent OOM issues on limited RAM environments
    _new_kwargs = {
        "use_textline_orientation": True,
        "lang": "en",
        "text_det_thresh": 0.3,
        "text_det_box_thresh": 0.5,
        "text_det_unclip_ratio": 2.0,
        "text_recognition_batch_size": 6,
        "enable_mkldnn": False,
        "text_detection_model_name": "PP-OCRv5_mobile_det",
    }
    _legacy_kwargs = {
        "use_angle_cls": True,
        "lang": "en",
        "det_db_thresh": 0.3,
        "det_db_box_thresh": 0.5,
        "det_db_unclip_ratio": 2.0,
        "rec_batch_num": 6,
    }

    for _kwargs in [_new_kwargs, _legacy_kwargs]:
        try:
            paddle_ocr = PaddleOCR(**_kwargs)
            PADDLE_AVAILABLE = True
            print("✅ PaddleOCR initialized (primary engine)")
            break
        except TypeError:
            continue
    else:
        raise RuntimeError(
            "No compatible PaddleOCR API signature found. "
            "Try: pip install --upgrade paddleocr"
        )

except Exception as e:
    PADDLE_AVAILABLE = False
    paddle_ocr = None
    print(f"⚠️ PaddleOCR not available: {e}")

_easyocr_reader  = None
_easyocr_checked = False

_OCR_MAX_DIM = 1600


# --- Image Helpers ---

def _cap_image_size(img_array: np.ndarray, max_dim: int = _OCR_MAX_DIM) -> np.ndarray:
    """Downscale image so the longest side does not exceed max_dim."""
    if img_array is None or img_array.size == 0:
        return img_array
    h, w    = img_array.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return img_array
    scale  = max_dim / longest
    new_w  = max(1, int(w * scale))
    new_h  = max(1, int(h * scale))
    return cv2.resize(img_array, (new_w, new_h), interpolation=cv2.INTER_AREA)


def preprocess_image(img_array: np.ndarray, verbose: bool = False) -> np.ndarray:
    """Grayscale → denoise → CLAHE → adaptive threshold."""
    if verbose:
        print("  🔧 Preprocessing image...", flush=True)
    if img_array is None or img_array.size == 0:
        return img_array
    gray     = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY) if len(img_array.shape) == 3 else img_array
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    binary   = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 11, 2)
    if verbose:
        print("    ✅ Preprocessing complete", flush=True)
    return binary


def ensure_color(img_array: np.ndarray) -> np.ndarray:
    """Ensure image is uint8 3-channel BGR for PaddleOCR compatibility."""
    if img_array is None or img_array.size == 0:
        return img_array
    if img_array.dtype != np.uint8:
        img_array = img_array.astype(np.uint8)
    if len(img_array.shape) == 3 and img_array.shape == 3:
        return img_array
    if len(img_array.shape) == 3 and img_array.shape == 4:
        return cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
    if len(img_array.shape) == 2:
        return cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)
    return img_array


# --- PaddleOCR Result Parser ---

def _parse_paddle_result(result_raw, conf_threshold: float = 0.3) -> list[str]:
    texts = []
    if not result_raw:
        return texts
    for page in result_raw:
        if page is None:
            continue
        if hasattr(page, "rec_texts"):
            rec_texts  = page.rec_texts or []
            rec_scores = getattr(page, "rec_scores", None) or [1.0] * len(rec_texts)
            for text, conf in zip(rec_texts, rec_scores):
                if text and str(text).strip() and float(conf) >= conf_threshold:
                    texts.append(str(text).strip())
            continue
        if isinstance(page, dict):
            rec_texts  = page.get("rec_texts") or page.get("rec_text") or []
            rec_scores = page.get("rec_scores") or page.get("rec_score") or [1.0] * len(rec_texts)
            for text, conf in zip(rec_texts, rec_scores):
                if text and str(text).strip() and float(conf) >= conf_threshold:
                    texts.append(str(text).strip())
            continue
        if isinstance(page, (list, tuple)):
            for item in page:
                try:
                    if not isinstance(item, (list, tuple)) or len(item) < 2:
                        continue
                    text_info = item
                    if not isinstance(text_info, (list, tuple)) or len(text_info) < 2:
                        continue
                    text = str(text_info)
                    conf = float(text_info)
                    if text.strip() and conf >= conf_threshold:
                        texts.append(text.strip())
                except (IndexError, TypeError, ValueError):
                    continue
            continue
    return texts


# --- OCR Engines ---

def extract_with_paddle(img_array: np.ndarray, verbose: bool = False) -> str:
    if not PADDLE_AVAILABLE:
        return ""
    if verbose:
        print("    → PaddleOCR (primary)...", flush=True)

    img_array = _cap_image_size(img_array)
    color_img = ensure_color(img_array)

    if verbose:
        print(f"      shape fed to PaddleOCR: {color_img.shape}", flush=True)

    result_raw = None
    try:
        result_raw = list(paddle_ocr.predict(color_img))
    except TypeError:
        result_raw = None
    except Exception as e:
        if verbose:
            print(f"      ✗ .predict() failed: {type(e).__name__}: {e}", flush=True)
        result_raw = None

    if result_raw is None:
        try:
            result_raw = paddle_ocr.ocr(color_img)
        except Exception as e:
            if verbose:
                print(f"      ✗ .ocr() failed: {type(e).__name__}: {e}", flush=True)
            return ""

    try:
        texts = _parse_paddle_result(result_raw, conf_threshold=0.3)
    except Exception as e:
        if verbose:
            print(f"      ✗ parsing failed: {type(e).__name__}: {e}", flush=True)
        return ""

    extracted = "\n".join(texts)
    if verbose:
        print(f"      {'✓' if extracted else '✗'} {len(extracted)} chars extracted", flush=True)
    return extracted


def _get_easyocr_reader():
    global _easyocr_reader, _easyocr_checked
    if _easyocr_checked:
        return _easyocr_reader
    _easyocr_checked = True
    try:
        import easyocr
        print("🔄 Initializing EasyOCR fallback...", flush=True)
        _easyocr_reader = easyocr.Reader(['en'], gpu=False)
        print("✅ EasyOCR initialized", flush=True)
    except Exception as e:
        _easyocr_reader = None
        print(f"⚠️ EasyOCR not available: {e}", flush=True)
    return _easyocr_reader


def extract_with_easyocr(img_array: np.ndarray, verbose: bool = False) -> str:
    reader = _get_easyocr_reader()
    if reader is None:
        return ""
    try:
        if verbose:
            print("    → EasyOCR (fallback)...", flush=True)
        img_array = _cap_image_size(img_array)
        result    = reader.readtext(img_array)
        texts     = [item for item in result if item > 0.3]
        extracted = "\n".join(texts)
        if verbose and extracted:
            print(f"      ✓ {len(extracted)} chars extracted", flush=True)
        return extracted
    except Exception as e:
        if verbose:
            print(f"      ✗ EasyOCR failed: {e}", flush=True)
        return ""


# --- Post-processing ---

def postprocess_text(text: str) -> str:
    if not text:
        return text
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    corrections = {
        r'\b[Mm]edica[|l1]': 'Medical',
        r'\b[Pp]atient':     'Patient',
        r'\b[Rr]eport':      'Report',
        r'\b[Tt]est':        'Test',
        r'\b[Bb]lood':       'Blood',
        r'\b[Dd]ate':        'Date',
        r'\b[Nn]ame':        'Name',
    }
    for pattern, replacement in corrections.items():
        text = re.sub(pattern, replacement, text)
    return text.strip()


# --- Shared Internal Helpers ---

def _prepare_for_easyocr_array(img_array, use_preprocessing=True, verbose=False):
    if use_preprocessing:
        return preprocess_image(img_array, verbose=verbose)
    if len(img_array.shape) == 3:
        return cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    return img_array


def _ocr_best_from_array(raw_img, use_preprocessing=True, verbose=False):
    """Attempts OCR with PaddleOCR first, falling back to EasyOCR on failure."""
    paddle_text = extract_with_paddle(raw_img, verbose=verbose)
    if paddle_text:
        if verbose:
            print(f"\n  ✅ Best result: PaddleOCR ({len(paddle_text)} chars)", flush=True)
        return paddle_text

    if verbose:
        print("  ⚠️ PaddleOCR returned empty — trying EasyOCR fallback...", flush=True)
    processed    = _prepare_for_easyocr_array(raw_img, use_preprocessing=use_preprocessing, verbose=verbose)
    easyocr_text = extract_with_easyocr(processed, verbose=verbose)
    if easyocr_text:
        if verbose:
            print(f"\n  ✅ Best result: EasyOCR fallback ({len(easyocr_text)} chars)", flush=True)
        return easyocr_text
    return ""


# --- Main Extraction Entry Points ---

def extract_text_universal(file_path, use_preprocessing=True, verbose=False):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    if verbose:
        print(f"\n{'='*80}", flush=True)
        print(f"🔍 OCR EXTRACTION: {os.path.basename(file_path)}", flush=True)
        print(f"{'='*80}", flush=True)

    image_exts = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp')
    if file_path.lower().endswith(image_exts):
        if verbose:
            print("📸 Image file detected", flush=True)
        try:
            img       = Image.open(file_path).convert("RGB")
            img_array = np.array(img)
            del img; gc.collect()
            text = _ocr_best_from_array(img_array, use_preprocessing, verbose)
            del img_array; gc.collect()
            if text:
                cleaned = postprocess_text(text)
                if verbose:
                    print(f"  ✅ Final text: {len(cleaned)} chars\n{'='*80}\n", flush=True)
                return cleaned
            if verbose:
                print(f"\n  ❌ No text extracted\n{'='*80}\n", flush=True)
            return ""
        except Exception as e:
            if verbose:
                print(f"\n  ❌ Image processing failed: {e}\n{'='*80}\n", flush=True)
            return ""

    elif file_path.lower().endswith('.pdf'):
        if verbose:
            print("📄 PDF file detected", flush=True)

        try:
            if verbose:
                print("  → Trying pdfplumber...", flush=True)
            with pdfplumber.open(file_path) as pdf:
                text = "".join(
                    (p.extract_text() or "") + "\n\n" for p in pdf.pages
                )
                if text.strip() and len(text.strip()) > 100:
                    if verbose:
                        print(f"  ✅ pdfplumber: {len(text)} chars\n{'='*80}\n", flush=True)
                    return text.strip()
                if verbose:
                    print(f"  ⚠️ pdfplumber: {len(text.strip())} chars, switching to OCR", flush=True)
        except Exception as e:
            if verbose:
                print(f"  ⚠️ pdfplumber failed: {e}", flush=True)

        if verbose:
            print("  → Image-based PDF — OCR one page at a time...", flush=True)
        try:
            from pdf2image import convert_from_path, pdfinfo_from_path
            try:
                num_pages = pdfinfo_from_path(file_path)["Pages"]
            except Exception:
                probe = convert_from_path(file_path, dpi=20)
                num_pages = len(probe); del probe; gc.collect()

            if verbose:
                print(f"     {num_pages} page(s) detected", flush=True)

            all_text = []
            for i in range(1, num_pages + 1):
                if verbose:
                    print(f"\n  📄 Page {i}/{num_pages}...", flush=True)
                pages = convert_from_path(file_path, dpi=150, first_page=i, last_page=i)
                if not pages:
                    continue
                img_array = np.array(pages.convert("RGB"))
                del pages; gc.collect()
                if verbose:
                    print(f"     raw shape: {img_array.shape}", flush=True)
                page_text = _ocr_best_from_array(img_array, use_preprocessing, verbose)
                del img_array; gc.collect()
                if page_text:
                    all_text.append(page_text)

            combined = "\n\n".join(all_text)
            if combined.strip():
                cleaned = postprocess_text(combined)
                if verbose:
                    print(f"\n  ✅ {len(cleaned)} chars from {len(all_text)}/{num_pages} pages\n{'='*80}\n", flush=True)
                return cleaned
            if verbose:
                print(f"\n  ❌ No text extracted\n{'='*80}\n", flush=True)
            return ""
        except Exception as e:
            if verbose:
                print(f"\n  ❌ PDF OCR failed: {e}\n{'='*80}\n", flush=True)
            return ""

    else:
        raise ValueError(f"Unsupported file type: {file_path}")


def extract_text_from_bytes(file_bytes, file_extension, use_preprocessing=True, verbose=False):
    ext = file_extension.lower()
    if not ext.startswith('.'):
        ext = '.' + ext

    if verbose:
        print(f"\n{'='*80}\n🔍 OCR EXTRACTION (in-memory, {ext})\n{'='*80}", flush=True)

    if ext == '.pdf':
        if verbose:
            print("📄 PDF (bytes) detected", flush=True)
        try:
            if verbose:
                print("  → Trying pdfplumber...", flush=True)
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = "".join((p.extract_text() or "") + "\n\n" for p in pdf.pages)
                if text.strip() and len(text.strip()) > 50:
                    if verbose:
                        print(f"  ✅ pdfplumber: {len(text)} chars\n{'='*80}\n", flush=True)
                    return text.strip()
                if verbose:
                    print(f"  ⚠️ pdfplumber: {len(text.strip())} chars, switching to OCR", flush=True)
        except Exception as e:
            if verbose:
                print(f"  ⚠️ pdfplumber failed: {e}", flush=True)

        if verbose:
            print("  → Image-based PDF — OCR one page at a time...", flush=True)
        try:
            from pdf2image import convert_from_bytes
            probe = convert_from_bytes(file_bytes, dpi=20)
            num_pages = len(probe); del probe; gc.collect()
            if verbose:
                print(f"     {num_pages} page(s) detected", flush=True)

            all_text = []
            for i in range(1, num_pages + 1):
                if verbose:
                    print(f"\n  📄 Page {i}/{num_pages}...", flush=True)
                pages = convert_from_bytes(file_bytes, dpi=150, first_page=i, last_page=i)
                if not pages:
                    continue
                img_array = np.array(pages.convert("RGB"))
                del pages; gc.collect()
                if verbose:
                    print(f"     raw shape: {img_array.shape}", flush=True)
                page_text = _ocr_best_from_array(img_array, use_preprocessing, verbose)
                del img_array; gc.collect()
                if page_text:
                    all_text.append(page_text)

            combined = "\n\n".join(all_text)
            if combined.strip():
                cleaned = postprocess_text(combined)
                if verbose:
                    print(f"\n  ✅ {len(cleaned)} chars from {len(all_text)}/{num_pages} pages\n{'='*80}\n", flush=True)
                return cleaned
            if verbose:
                print(f"\n  ❌ No text extracted\n{'='*80}\n", flush=True)
            return ""
        except Exception as e:
            if verbose:
                print(f"\n  ❌ PDF OCR failed: {e}\n{'='*80}\n", flush=True)
            return ""

    image_exts = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp')
    if ext in image_exts:
        if verbose:
            print("📸 Image (bytes) detected", flush=True)
        try:
            img       = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            img_array = np.array(img); del img; gc.collect()
            text = _ocr_best_from_array(img_array, use_preprocessing, verbose)
            del img_array; gc.collect()
            if text:
                cleaned = postprocess_text(text)
                if verbose:
                    print(f"  ✅ Final text: {len(cleaned)} chars\n{'='*80}\n", flush=True)
                return cleaned
            if verbose:
                print(f"\n  ❌ No text extracted\n{'='*80}\n", flush=True)
            return ""
        except Exception as e:
            if verbose:
                print(f"\n  ❌ Image processing failed: {e}\n{'='*80}\n", flush=True)
            return ""

    raise ValueError(f"Unsupported file extension: {file_extension}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        test_file = sys.argv
        print(f"\nTesting OCR on: {test_file}\n")
        result = extract_text_universal(test_file, use_preprocessing=True, verbose=True)
        print(f"\n{'='*80}\nEXTRACTED TEXT:\n{'='*80}\n{result}\n{'='*80}\n")
    else:
        print("Usage: python extractor_OCR.py <image_or_pdf_file>")