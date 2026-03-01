# rag_pipeline/key_points.py

import re

def extract_key_points(chunks, debug=False):
    important_points = []
    seen = set()
    
    for idx, chunk in enumerate(chunks):
        if debug:
            print(f"\n{'='*60}\nCHUNK {idx + 1}:\n{'='*60}")
            print(chunk[:500])
            print(f"{'='*60}\n")
        
        for line in chunk.split('\n'):
            line = line.strip()
            if len(line) < 5:
                continue
            
            pattern = r'^([A-Za-z0-9\s\(\),\.\-/]+?)\s+(\d+\.?\d*)\s+([a-zA-Z0-9\/\^µ]+)'
            match = re.match(pattern, line, re.I)
            
            if match:
                test_name = match.group(1).strip()
                value = match.group(2)
                unit = match.group(3)
                
                skip = ['patient', 'age', 'gender', 'lab', 'registered', 'reported', 'test description']
                if any(s in test_name.lower() for s in skip):
                    continue
                
                if len(test_name) < 3 or not re.search(r'[a-zA-Z]{2,}', test_name):
                    continue
                
                result = f"{test_name}: {value} {unit}"
                
                if debug:
                    print(f"✓ EXTRACTED: {result}")
                
                if result not in seen:
                    important_points.append(result)
                    seen.add(result)
        
        chunk_lower = chunk.lower()
        score = 0
        
        if any(kw in chunk_lower for kw in ['interpretation', 'deficiency', 'insufficiency', 'method', 'note']):
            score += 2
        
        if 'result' in chunk_lower or 'finding' in chunk_lower:
            score += 1
        
        if score >= 2 and len(chunk) > 30:
            cleaned = chunk.strip()
            is_dup = any(cleaned in s or s in cleaned for s in seen)
            
            if not is_dup:
                if debug:
                    print(f"✓ INTERPRETATION ADDED")
                important_points.append(cleaned)
                seen.add(cleaned)
    
    return important_points
