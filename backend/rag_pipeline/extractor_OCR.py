# backend/rag_pipeline/extractor_OCR.py

import os
import re
import cv2
import numpy as np
from PIL import Image
import pdfplumber

# OCR libraries
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("⚠️ Tesseract not available")

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
    paddle_ocr = PaddleOCR(
        use_angle_cls=True,
        lang='en',
        use_gpu=False,
        det_db_thresh=0.3,
        det_db_box_thresh=0.5,
        det_db_unclip_ratio=2.0,
        rec_batch_num=6,
        show_log=False
    )
    print("✅ PaddleOCR initialized")
except:
    PADDLE_AVAILABLE = False
    paddle_ocr = None
    print("⚠️ PaddleOCR not available")

try:
    import easyocr
    EASYOCR_AVAILABLE = True
    easyocr_reader = easyocr.Reader(['en'], gpu=False)
    print("✅ EasyOCR initialized")
except:
    EASYOCR_AVAILABLE = False
    easyocr_reader = None
    print("⚠️ EasyOCR not available")


def preprocess_image(img_array: np.ndarray, verbose: bool = False) -> np.ndarray:
    """Optimized preprocessing for medical documents"""
    if verbose:
        print("  🔧 Preprocessing image...", flush=True)
    
    if img_array is None or img_array.size == 0:
        return img_array
    
    # Convert to grayscale
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_array
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    
    # Enhance contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    
    # Adaptive threshold
    binary = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )
    
    if verbose:
        print("    ✅ Preprocessing complete", flush=True)
    
    return binary


def extract_with_paddle(img_array: np.ndarray, verbose: bool = False) -> str:
    """Extract text using PaddleOCR"""
    if not PADDLE_AVAILABLE:
        return ""
    
    try:
        if verbose:
            print("    → PaddleOCR...", flush=True)
        
        result = paddle_ocr.ocr(img_array, cls=True)
        
        if not result or not result[0]:
            return ""
        
        texts = []
        for line in result[0]:
            if line and len(line) >= 2:
                text_info = line[1]
                if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                    text = text_info[0]
                    confidence = text_info[1]
                    
                    if confidence >= 0.3 and text.strip():
                        texts.append(text.strip())
        
        extracted = "\n".join(texts)
        
        if verbose and extracted:
            print(f"      ✓ {len(extracted)} chars extracted", flush=True)
        
        return extracted
        
    except Exception as e:
        if verbose:
            print(f"      ✗ PaddleOCR failed: {e}", flush=True)
        return ""


def extract_with_tesseract(img_array: np.ndarray, verbose: bool = False) -> str:
    """Extract text using Tesseract"""
    if not TESSERACT_AVAILABLE:
        return ""
    
    try:
        if verbose:
            print("    → Tesseract...", flush=True)
        
        pil_img = Image.fromarray(img_array)
        
        # Try PSM 6 (uniform block of text)
        text = pytesseract.image_to_string(
            pil_img,
            lang='eng',
            config='--oem 3 --psm 6'
        )
        
        if verbose and text.strip():
            print(f"      ✓ {len(text)} chars extracted", flush=True)
        
        return text.strip()
        
    except Exception as e:
        if verbose:
            print(f"      ✗ Tesseract failed: {e}", flush=True)
        return ""


def extract_with_easyocr(img_array: np.ndarray, verbose: bool = False) -> str:
    """Extract text using EasyOCR"""
    if not EASYOCR_AVAILABLE:
        return ""
    
    try:
        if verbose:
            print("    → EasyOCR...", flush=True)
        
        result = easyocr_reader.readtext(img_array)
        
        texts = [item[1] for item in result if item[2] > 0.3]
        extracted = "\n".join(texts)
        
        if verbose and extracted:
            print(f"      ✓ {len(extracted)} chars extracted", flush=True)
        
        return extracted
        
    except Exception as e:
        if verbose:
            print(f"      ✗ EasyOCR failed: {e}", flush=True)
        return ""


def postprocess_text(text: str) -> str:
    """Clean up extracted text"""
    if not text:
        return text
    
    # Remove excessive whitespace
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Fix common OCR errors in medical terms
    corrections = {
        r'\b[Mm]edica[|l1]': 'Medical',
        r'\b[Pp]atient': 'Patient',
        r'\b[Rr]eport': 'Report',
        r'\b[Tt]est': 'Test',
        r'\b[Bb]lood': 'Blood',
        r'\b[Dd]ate': 'Date',
        r'\b[Nn]ame': 'Name',
    }
    
    for pattern, replacement in corrections.items():
        text = re.sub(pattern, replacement, text)
    
    return text.strip()


def extract_text_universal(file_path: str, use_preprocessing: bool = True, verbose: bool = False) -> str:
    """
    Universal text extraction from images and PDFs
    
    Args:
        file_path: Path to file
        use_preprocessing: Apply image preprocessing (default: True)
        verbose: Print progress (default: False)
    
    Returns:
        Extracted text string
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if verbose:
        print(f"\n{'='*80}", flush=True)
        print(f"🔍 OCR EXTRACTION: {os.path.basename(file_path)}", flush=True)
        print(f"{'='*80}", flush=True)
    
    # ============================================
    # IMAGE FILES
    # ============================================
    if file_path.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp')):
        if verbose:
            print("📸 Image file detected", flush=True)
        
        try:
            # Load image
            img = Image.open(file_path)
            img_array = np.array(img)
            
            if verbose:
                print(f"   Image size: {img.size}", flush=True)
            
            # Preprocess
            if use_preprocessing:
                processed = preprocess_image(img_array, verbose=verbose)
            else:
                if len(img_array.shape) == 3:
                    processed = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
                else:
                    processed = img_array
            
            # Try multiple OCR engines
            results = []
            
            # Try PaddleOCR
            paddle_text = extract_with_paddle(processed, verbose=verbose)
            if paddle_text:
                results.append(("PaddleOCR", paddle_text))
            
            # Try Tesseract
            tesseract_text = extract_with_tesseract(processed, verbose=verbose)
            if tesseract_text:
                results.append(("Tesseract", tesseract_text))
            
            # Try EasyOCR
            easyocr_text = extract_with_easyocr(processed, verbose=verbose)
            if easyocr_text:
                results.append(("EasyOCR", easyocr_text))
            
            # Select best result (longest text)
            if results:
                best = max(results, key=lambda x: len(x[1]))
                engine_name, text = best
                
                if verbose:
                    print(f"\n  ✅ Best result: {engine_name} ({len(text)} chars)", flush=True)
                
                # Postprocess
                cleaned = postprocess_text(text)
                
                if verbose:
                    print(f"  ✅ Final text: {len(cleaned)} chars", flush=True)
                    print(f"{'='*80}\n", flush=True)
                
                return cleaned
            else:
                if verbose:
                    print("\n  ❌ No text extracted from any engine", flush=True)
                    print(f"{'='*80}\n", flush=True)
                return ""
                
        except Exception as e:
            if verbose:
                print(f"\n  ❌ Image processing failed: {e}", flush=True)
                print(f"{'='*80}\n", flush=True)
            return ""
    
    # ============================================
    # PDF FILES
    # ============================================
    elif file_path.lower().endswith('.pdf'):
        if verbose:
            print("📄 PDF file detected", flush=True)
        
        # Try pdfplumber first (for selectable PDFs)
        try:
            if verbose:
                print("  → Trying pdfplumber...", flush=True)
            
            with pdfplumber.open(file_path) as pdf:
                text = ""
                for i, page in enumerate(pdf.pages, 1):
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n\n"
                
                if text.strip() and len(text.strip()) > 100:
                    if verbose:
                        print(f"  ✅ pdfplumber: {len(text)} chars from {len(pdf.pages)} pages", flush=True)
                        print(f"{'='*80}\n", flush=True)
                    return text.strip()
                else:
                    if verbose:
                        print(f"  ⚠️ pdfplumber: insufficient text ({len(text.strip())} chars)", flush=True)
                        
        except Exception as e:
            if verbose:
                print(f"  ⚠️ pdfplumber failed: {e}", flush=True)
        
        # Scanned PDF - convert to images and use OCR
        if verbose:
            print("  → Scanned PDF - using OCR...", flush=True)
        
        try:
            from pdf2image import convert_from_path
            
            images = convert_from_path(file_path, dpi=300)
            
            if verbose:
                print(f"     Converted to {len(images)} images", flush=True)
            
            all_text = []
            
            for i, img in enumerate(images, 1):
                if verbose:
                    print(f"\n  📄 Processing page {i}/{len(images)}...", flush=True)
                
                img_array = np.array(img)
                
                # Preprocess
                if use_preprocessing:
                    processed = preprocess_image(img_array, verbose=verbose)
                else:
                    if len(img_array.shape) == 3:
                        processed = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
                    else:
                        processed = img_array
                
                # Try OCR engines
                page_text = ""
                
                # Try PaddleOCR
                paddle_text = extract_with_paddle(processed, verbose=verbose)
                if paddle_text and len(paddle_text) > len(page_text):
                    page_text = paddle_text
                
                # Try Tesseract
                tesseract_text = extract_with_tesseract(processed, verbose=verbose)
                if tesseract_text and len(tesseract_text) > len(page_text):
                    page_text = tesseract_text
                
                if page_text:
                    all_text.append(page_text)
            
            combined = "\n\n".join(all_text)
            
            if combined.strip():
                cleaned = postprocess_text(combined)
                
                if verbose:
                    print(f"\n  ✅ OCR complete: {len(cleaned)} chars from {len(all_text)} pages", flush=True)
                    print(f"{'='*80}\n", flush=True)
                
                return cleaned
            else:
                if verbose:
                    print(f"\n  ❌ No text extracted from PDF", flush=True)
                    print(f"{'='*80}\n", flush=True)
                return ""
                
        except Exception as e:
            if verbose:
                print(f"\n  ❌ PDF OCR failed: {e}", flush=True)
                print(f"{'='*80}\n", flush=True)
            return ""
    
    else:
        raise ValueError(f"Unsupported file type: {file_path}")


# Test function
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
        print(f"\nTesting OCR on: {test_file}\n")
        result = extract_text_universal(test_file, use_preprocessing=True, verbose=True)
        print(f"\n{'='*80}")
        print("EXTRACTED TEXT:")
        print(f"{'='*80}")
        print(result)
        print(f"{'='*80}\n")
    else:
        print("Usage: python extractor_OCR.py <image_or_pdf_file>")